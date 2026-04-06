use std::collections::{BTreeMap, BTreeSet};

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{
    IndexedText, MappedText, MappedTextError, NormalizationEdit, RenderedMappedText, Span,
    build_copy_map, sort_and_dedup_normalization_edits,
};
use crate::framework::{MacroCandidate, MacroCandidateStrategy, MacroImport};

#[derive(Debug, Clone, PartialEq)]
pub struct SynthesisPlan {
    pub imports: Vec<MacroImport>,
    pub targets: Vec<SynthesisTarget>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SynthesisTarget {
    pub declaration_id: LeanString,
    pub candidate: MacroCandidate,
    pub normalized_code: LeanString,
    pub(crate) normalized_rendered: RenderedMappedText,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct NormalizedSegment {
    pub original_start: usize,
    pub generated_start: usize,
    pub len: usize,
}

type OwnedNormalizationEdit = (LeanString, Span, Vec<NormalizationEdit>);

struct MappedNormalizationContext<'a> {
    source: &'a IndexedText<'a>,
    source_name: &'a str,
    source_anchors: &'a [usize],
    insertions: &'a [(usize, LeanString)],
}

struct NormalizedCandidateOutput {
    rendered: RenderedMappedText,
    segments: Vec<NormalizedSegment>,
}

pub fn build_synthesis_plan(
    source: &LeanString,
    source_name: &LeanString,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
    source_anchors: &[usize],
) -> Result<SynthesisPlan, MappedTextError> {
    let mut merged_candidates = candidates.to_vec();
    merge_owned_candidate_normalization_edits(&mut merged_candidates);
    let targets = merged_candidates
        .iter()
        .filter(|candidate| candidate.strategy == MacroCandidateStrategy::Standalone)
        .enumerate()
        .map(|(index, candidate)| {
            let declaration_id = LeanString::from(format!("__lf_{index}"));
            let NormalizedCandidateOutput {
                rendered: normalized_rendered,
                segments: normalized_segments,
            } = normalize_candidate_output(source, source_name, candidate, source_anchors)?;
            let normalized_code = normalized_rendered.code.clone();
            Ok(SynthesisTarget {
                declaration_id,
                candidate: candidate.clone(),
                normalized_code,
                normalized_rendered,
                normalized_segments,
            })
        })
        .collect::<Result<Vec<_>, MappedTextError>>()?;

    Ok(SynthesisPlan {
        imports: imports.to_vec(),
        targets,
    })
}

pub fn merge_owned_candidate_normalization_edits(candidates: &mut [MacroCandidate]) {
    let mut owned_by_parent = BTreeMap::<LeanString, Vec<OwnedNormalizationEdit>>::new();
    for candidate in candidates.iter() {
        if candidate.strategy == MacroCandidateStrategy::OwnedByParent
            && let Some(owner_id) = &candidate.owner_id
        {
            owned_by_parent.entry(owner_id.clone()).or_default().push((
                candidate.id.clone(),
                candidate.outer_span,
                candidate.normalization_edits.clone(),
            ));
        }
    }

    for candidate in candidates.iter_mut() {
        if candidate.strategy != MacroCandidateStrategy::Standalone {
            continue;
        }
        let mut edits = candidate.normalization_edits.clone();
        collect_owned_normalization_edits(&candidate.id, &owned_by_parent, &mut edits);
        sort_and_dedup_normalization_edits(&mut edits);
        candidate.normalization_edits = edits;
    }
}

fn collect_owned_normalization_edits(
    owner_id: &LeanString,
    owned_by_parent: &BTreeMap<LeanString, Vec<OwnedNormalizationEdit>>,
    edits: &mut Vec<NormalizationEdit>,
) {
    let Some(children) = owned_by_parent.get(owner_id) else {
        return;
    };

    let mut sorted_children: Vec<&OwnedNormalizationEdit> = children.iter().collect();
    sorted_children.sort_by_key(|(_, span, _)| (span.start, span.end));

    for (child_id, _, child_edits) in sorted_children {
        edits.extend(child_edits.iter().cloned());
        collect_owned_normalization_edits(child_id, owned_by_parent, edits);
    }
}

fn normalize_candidate_output(
    source: &LeanString,
    source_name: &LeanString,
    candidate: &MacroCandidate,
    source_anchors: &[usize],
) -> Result<NormalizedCandidateOutput, MappedTextError> {
    let (strips, insertions) = collect_normalization_operations(candidate, source.len());
    let indexed_source = IndexedText::new(source);
    let mut rendered = MappedText::new(source_name, source);
    let mut segments = Vec::new();
    let mut generated_len = 0usize;
    let mut cursor = candidate.outer_span.start;
    let mut insertion_index = 0usize;
    let mapped_context = MappedNormalizationContext {
        source: &indexed_source,
        source_name,
        source_anchors,
        insertions: &insertions,
    };

    for strip in strips {
        if strip.start > cursor {
            append_normalized_chunk(
                &mapped_context,
                &mut rendered,
                &mut segments,
                &mut generated_len,
                cursor,
                strip.start,
                &mut insertion_index,
            );
        }

        while insertion_index < insertions.len() && insertions[insertion_index].0 == strip.start {
            rendered.push_unmapped_dynamic(&insertions[insertion_index].1);
            generated_len += insertions[insertion_index].1.len();
            insertion_index += 1;
        }

        cursor = cursor.max(strip.end);
    }

    if cursor < candidate.outer_span.end {
        append_normalized_chunk(
            &mapped_context,
            &mut rendered,
            &mut segments,
            &mut generated_len,
            cursor,
            candidate.outer_span.end,
            &mut insertion_index,
        );
    }

    while insertion_index < insertions.len()
        && insertions[insertion_index].0 <= candidate.outer_span.end
    {
        if insertions[insertion_index].0 == candidate.outer_span.end {
            rendered.push_unmapped_dynamic(&insertions[insertion_index].1);
        }
        insertion_index += 1;
    }

    Ok(NormalizedCandidateOutput {
        rendered: rendered.into_rendered()?,
        segments,
    })
}

fn collect_normalization_operations(
    candidate: &MacroCandidate,
    source_len: usize,
) -> (Vec<Span>, Vec<(usize, LeanString)>) {
    let mut strips = Vec::new();
    let mut insertions = Vec::new();
    let outer_start = candidate.outer_span.start.min(source_len);
    let outer_end = candidate.outer_span.end.min(source_len);

    for edit in &candidate.normalization_edits {
        match edit {
            NormalizationEdit::Delete { span } => {
                let start = span.start.clamp(outer_start, outer_end);
                let end = span.end.clamp(outer_start, outer_end);
                if start < end {
                    strips.push(Span::new(start, end));
                }
            }
            NormalizationEdit::Insert { at, text } => {
                let at = (*at)
                    .max(candidate.outer_span.start)
                    .min(candidate.outer_span.end);
                insertions.push((at, text.clone()));
            }
        }
    }

    let insertion_points = insertions
        .iter()
        .map(|(at, _)| *at)
        .collect::<BTreeSet<_>>();

    strips.sort_by_key(|span| (span.start, span.end));
    let mut merged: Vec<Span> = Vec::new();
    for strip in strips {
        if let Some(last) = merged.last_mut() {
            let overlaps = strip.start < last.end;
            let touches_without_boundary_insertion =
                strip.start == last.end && !insertion_points.contains(&strip.start);
            if overlaps || touches_without_boundary_insertion {
                last.end = last.end.max(strip.end);
                continue;
            }
        }
        merged.push(strip);
    }

    insertions.sort_by_key(|(at, _)| *at);
    (merged, insertions)
}

fn append_normalized_chunk(
    context: &MappedNormalizationContext<'_>,
    rendered: &mut MappedText<'_>,
    segments: &mut Vec<NormalizedSegment>,
    generated_len: &mut usize,
    start: usize,
    end: usize,
    insertion_index: &mut usize,
) {
    let mut cursor = start;

    while cursor < end {
        while *insertion_index < context.insertions.len()
            && context.insertions[*insertion_index].0 == cursor
        {
            rendered.push_unmapped_dynamic(&context.insertions[*insertion_index].1);
            *generated_len += context.insertions[*insertion_index].1.len();
            *insertion_index += 1;
        }

        let next_insertion = context
            .insertions
            .get(*insertion_index)
            .filter(|(at, _)| *at > cursor && *at < end)
            .map(|(at, _)| *at)
            .unwrap_or(end);
        let span = Span::new(cursor, next_insertion);
        if let Some(chunk) = context.source.text().get(span.start..span.end)
            && !chunk.is_empty()
        {
            segments.push(NormalizedSegment {
                original_start: cursor,
                generated_start: *generated_len,
                len: chunk.len(),
            });
            let chunk_anchors =
                collect_chunk_copy_anchors(context.source.text(), span, context.source_anchors);
            rendered.push(
                chunk,
                build_copy_map(context.source_name, context.source, span, &chunk_anchors),
            );
            *generated_len += chunk.len();
        }
        cursor = next_insertion;
    }
}

fn collect_chunk_copy_anchors(source: &str, span: Span, source_anchors: &[usize]) -> Vec<usize> {
    let mut anchors = BTreeSet::new();
    anchors.extend(
        source_anchors
            .iter()
            .copied()
            .filter(|anchor| *anchor > span.start && *anchor < span.end),
    );

    for (offset, byte) in source.as_bytes()[span.start..span.end].iter().enumerate() {
        if *byte == b'\n' {
            let anchor = span.start + offset + 1;
            if anchor > span.start && anchor < span.end {
                anchors.insert(anchor);
            }
        }
    }

    anchors.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use lean_string::LeanString;

    use crate::framework::{MacroCandidateKind, MacroCandidateStrategy, MacroFlavor};

    use super::*;

    fn ls(text: &str) -> LeanString {
        LeanString::from(text)
    }

    fn candidate(outer_span: Span, normalization_edits: Vec<NormalizationEdit>) -> MacroCandidate {
        MacroCandidate {
            id: LeanString::from_static_str("candidate"),
            kind: MacroCandidateKind::CallExpression,
            imported_name: LeanString::from_static_str("t"),
            local_name: LeanString::from_static_str("t"),
            flavor: MacroFlavor::Direct,
            outer_span,
            normalized_span: outer_span,
            normalization_edits,
            source_map_anchor: None,
            owner_id: None,
            strategy: MacroCandidateStrategy::Standalone,
        }
    }

    fn normalize_for_test(
        source: &LeanString,
        candidate: &MacroCandidate,
    ) -> (LeanString, Vec<NormalizedSegment>) {
        let output = normalize_candidate_output(
            source,
            &LeanString::from_static_str("test.tsx"),
            candidate,
            &[],
        )
        .expect("normalized candidate output should succeed");
        (output.rendered.code, output.segments)
    }

    #[test]
    fn applies_insertions_at_outer_span_boundaries() {
        let source = ls("prefix<VALUE>suffix");
        let outer_start = "prefix<".len();
        let outer_end = outer_start + "VALUE".len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![
                NormalizationEdit::Insert {
                    at: outer_start,
                    text: LeanString::from_static_str("["),
                },
                NormalizationEdit::Insert {
                    at: outer_end,
                    text: LeanString::from_static_str("]"),
                },
            ],
        );

        let (normalized, segments) = normalize_for_test(&source, &candidate);

        assert_eq!(normalized, "[VALUE]");
        assert_eq!(
            segments,
            vec![NormalizedSegment {
                original_start: outer_start,
                generated_start: 1,
                len: "VALUE".len(),
            }]
        );
    }

    #[test]
    fn applies_insertions_adjacent_to_deleted_ranges() {
        let source = ls("abcde");
        let candidate = candidate(
            Span::new(0, source.len()),
            vec![
                NormalizationEdit::Delete {
                    span: Span::new(1, 3),
                },
                NormalizationEdit::Insert {
                    at: 1,
                    text: LeanString::from_static_str("["),
                },
                NormalizationEdit::Insert {
                    at: 3,
                    text: LeanString::from_static_str("]"),
                },
            ],
        );

        let (normalized, segments) = normalize_for_test(&source, &candidate);

        assert_eq!(normalized, "a[]de");
        assert_eq!(
            segments,
            vec![
                NormalizedSegment {
                    original_start: 0,
                    generated_start: 0,
                    len: 1,
                },
                NormalizedSegment {
                    original_start: 3,
                    generated_start: 3,
                    len: 2,
                },
            ]
        );
    }

    #[test]
    fn clamps_delete_spans_to_outer_span() {
        let source = ls("XXabcdeYY");
        let outer_start = "XX".len();
        let outer_end = outer_start + "abcde".len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![NormalizationEdit::Delete {
                span: Span::new(0, source.len()),
            }],
        );

        let (normalized, segments) = normalize_for_test(&source, &candidate);

        assert_eq!(normalized, "");
        assert!(segments.is_empty());
    }

    #[test]
    fn preserves_byte_offsets_for_unicode_and_crlf_sources() {
        let source = ls("A😀\r\nBéZ");
        let outer_start = "A".len();
        let outer_text = "😀\r\nBé";
        let outer_end = outer_start + outer_text.len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![
                NormalizationEdit::Insert {
                    at: outer_start,
                    text: LeanString::from_static_str("<"),
                },
                NormalizationEdit::Delete {
                    span: Span::new(outer_start + "😀".len(), outer_start + "😀\r\n".len()),
                },
                NormalizationEdit::Insert {
                    at: outer_end,
                    text: LeanString::from_static_str(">"),
                },
            ],
        );

        let (normalized, segments) = normalize_for_test(&source, &candidate);

        assert_eq!(normalized, "<😀Bé>");
        assert_eq!(
            segments,
            vec![
                NormalizedSegment {
                    original_start: outer_start,
                    generated_start: 1,
                    len: "😀".len(),
                },
                NormalizedSegment {
                    original_start: outer_start + "😀\r\n".len(),
                    generated_start: 1 + "😀".len(),
                    len: "Bé".len(),
                },
            ]
        );
    }

    #[test]
    fn preserves_boundary_insertions_between_touching_delete_ranges_after_owned_merge() {
        let source = ls("abcdef");
        let mut candidates = vec![
            MacroCandidate {
                id: LeanString::from_static_str("parent"),
                kind: MacroCandidateKind::CallExpression,
                imported_name: LeanString::from_static_str("t"),
                local_name: LeanString::from_static_str("t"),
                flavor: MacroFlavor::Direct,
                outer_span: Span::new(0, source.len()),
                normalized_span: Span::new(0, source.len()),
                normalization_edits: vec![NormalizationEdit::Delete {
                    span: Span::new(1, 3),
                }],
                source_map_anchor: None,
                owner_id: None,
                strategy: MacroCandidateStrategy::Standalone,
            },
            MacroCandidate {
                id: LeanString::from_static_str("child"),
                kind: MacroCandidateKind::CallExpression,
                imported_name: LeanString::from_static_str("t"),
                local_name: LeanString::from_static_str("t"),
                flavor: MacroFlavor::Direct,
                outer_span: Span::new(0, source.len()),
                normalized_span: Span::new(0, source.len()),
                normalization_edits: vec![
                    NormalizationEdit::Insert {
                        at: 3,
                        text: LeanString::from_static_str("[]"),
                    },
                    NormalizationEdit::Delete {
                        span: Span::new(3, 5),
                    },
                ],
                source_map_anchor: None,
                owner_id: Some(LeanString::from_static_str("parent")),
                strategy: MacroCandidateStrategy::OwnedByParent,
            },
        ];

        merge_owned_candidate_normalization_edits(&mut candidates);
        let parent = candidates
            .iter()
            .find(|candidate| candidate.id == LeanString::from_static_str("parent"))
            .expect("parent candidate should exist");

        let (normalized, segments) = normalize_for_test(&source, parent);

        assert_eq!(normalized, "a[]f");
        assert_eq!(
            segments,
            vec![
                NormalizedSegment {
                    original_start: 0,
                    generated_start: 0,
                    len: 1,
                },
                NormalizedSegment {
                    original_start: 5,
                    generated_start: 3,
                    len: 1,
                },
            ]
        );
    }

    #[test]
    fn normalization_string_and_mapped_render_paths_emit_identical_code() {
        let source = ls("prefix<A😀\r\nBéZ>suffix");
        let outer_start = "prefix<".len();
        let outer_end = outer_start + "A😀\r\nBéZ".len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![
                NormalizationEdit::Insert {
                    at: outer_start,
                    text: LeanString::from_static_str("("),
                },
                NormalizationEdit::Delete {
                    span: Span::new(outer_start + "A".len(), outer_start + "A😀\r\n".len()),
                },
                NormalizationEdit::Insert {
                    at: outer_start + "A😀\r\n".len(),
                    text: LeanString::from_static_str("::"),
                },
                NormalizationEdit::Insert {
                    at: outer_end,
                    text: LeanString::from_static_str(")"),
                },
            ],
        );

        let source_name = ls("test.tsx");
        let output = normalize_candidate_output(&source, &source_name, &candidate, &[])
            .expect("unified normalization should succeed");

        assert_eq!(output.rendered.code, "(A::BéZ)");
    }
}
