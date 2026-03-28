use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::Span;
use crate::framework::{MacroCandidate, MacroImport, NormalizationEdit};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SynthesisPlan {
    pub imports: Vec<MacroImport>,
    pub targets: Vec<SynthesisTarget>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SynthesisTarget {
    pub declaration_id: String,
    pub candidate: MacroCandidate,
    pub normalized_code: String,
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

pub fn build_synthesis_plan(
    source: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
) -> SynthesisPlan {
    let targets = candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| {
            let declaration_id = format!("__lf_{index}");
            let (normalized_code, normalized_segments) =
                normalize_candidate_source(source, candidate);
            SynthesisTarget {
                declaration_id,
                candidate: candidate.clone(),
                normalized_code,
                normalized_segments,
            }
        })
        .collect::<Vec<_>>();

    SynthesisPlan {
        imports: imports.to_vec(),
        targets,
    }
}

fn normalize_candidate_source(
    source: &str,
    candidate: &MacroCandidate,
) -> (String, Vec<NormalizedSegment>) {
    let (strips, insertions) = collect_normalization_operations(candidate, source.len());
    let mut generated = String::new();
    let mut segments = Vec::new();
    let mut cursor = candidate.outer_span.start;
    let mut insertion_index = 0usize;

    for strip in strips {
        if strip.start > cursor {
            append_chunk(
                source,
                &mut generated,
                &mut segments,
                cursor,
                strip.start,
                &insertions,
                &mut insertion_index,
            );
        }

        while insertion_index < insertions.len() && insertions[insertion_index].0 == strip.start {
            generated.push_str(&insertions[insertion_index].1);
            insertion_index += 1;
        }

        cursor = cursor.max(strip.end);
    }

    if cursor < candidate.outer_span.end {
        append_chunk(
            source,
            &mut generated,
            &mut segments,
            cursor,
            candidate.outer_span.end,
            &insertions,
            &mut insertion_index,
        );
    }

    while insertion_index < insertions.len()
        && insertions[insertion_index].0 <= candidate.outer_span.end
    {
        if insertions[insertion_index].0 == candidate.outer_span.end {
            generated.push_str(&insertions[insertion_index].1);
        }
        insertion_index += 1;
    }

    (generated, segments)
}

fn collect_normalization_operations(
    candidate: &MacroCandidate,
    source_len: usize,
) -> (Vec<Span>, Vec<(usize, String)>) {
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

    strips.sort_by_key(|span| (span.start, span.end));
    let mut merged: Vec<Span> = Vec::new();
    for strip in strips {
        if let Some(last) = merged.last_mut()
            && strip.start <= last.end
        {
            last.end = last.end.max(strip.end);
            continue;
        }
        merged.push(strip);
    }

    insertions.sort_by_key(|(at, _)| *at);
    (merged, insertions)
}

fn append_chunk(
    source: &str,
    generated: &mut String,
    segments: &mut Vec<NormalizedSegment>,
    start: usize,
    end: usize,
    insertions: &[(usize, String)],
    insertion_index: &mut usize,
) {
    let mut cursor = start;

    while cursor < end {
        while *insertion_index < insertions.len() && insertions[*insertion_index].0 == cursor {
            generated.push_str(&insertions[*insertion_index].1);
            *insertion_index += 1;
        }

        let next_insertion = insertions
            .get(*insertion_index)
            .filter(|(at, _)| *at > cursor && *at < end)
            .map(|(at, _)| *at)
            .unwrap_or(end);
        let chunk = &source[cursor..next_insertion];
        if !chunk.is_empty() {
            let generated_start = generated.len();
            generated.push_str(chunk);
            segments.push(NormalizedSegment {
                original_start: cursor,
                generated_start,
                len: chunk.len(),
            });
        }
        cursor = next_insertion;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::framework::{MacroCandidateKind, MacroCandidateStrategy, MacroFlavor};

    fn candidate(outer_span: Span, normalization_edits: Vec<NormalizationEdit>) -> MacroCandidate {
        MacroCandidate {
            id: "candidate".to_string(),
            kind: MacroCandidateKind::CallExpression,
            imported_name: "t".to_string(),
            local_name: "t".to_string(),
            flavor: MacroFlavor::Direct,
            outer_span,
            normalized_span: outer_span,
            normalization_edits,
            source_map_anchor: None,
            owner_id: None,
            strategy: MacroCandidateStrategy::Standalone,
        }
    }

    #[test]
    fn applies_insertions_at_outer_span_boundaries() {
        let source = "prefix<VALUE>suffix";
        let outer_start = "prefix<".len();
        let outer_end = outer_start + "VALUE".len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![
                NormalizationEdit::Insert {
                    at: outer_start,
                    text: "[".to_string(),
                },
                NormalizationEdit::Insert {
                    at: outer_end,
                    text: "]".to_string(),
                },
            ],
        );

        let (normalized, segments) = normalize_candidate_source(source, &candidate);

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
        let source = "abcde";
        let candidate = candidate(
            Span::new(0, source.len()),
            vec![
                NormalizationEdit::Delete {
                    span: Span::new(1, 3),
                },
                NormalizationEdit::Insert {
                    at: 1,
                    text: "[".to_string(),
                },
                NormalizationEdit::Insert {
                    at: 3,
                    text: "]".to_string(),
                },
            ],
        );

        let (normalized, segments) = normalize_candidate_source(source, &candidate);

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
        let source = "XXabcdeYY";
        let outer_start = "XX".len();
        let outer_end = outer_start + "abcde".len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![NormalizationEdit::Delete {
                span: Span::new(0, source.len()),
            }],
        );

        let (normalized, segments) = normalize_candidate_source(source, &candidate);

        assert_eq!(normalized, "");
        assert!(segments.is_empty());
    }

    #[test]
    fn preserves_byte_offsets_for_unicode_and_crlf_sources() {
        let source = "A😀\r\nBéZ";
        let outer_start = "A".len();
        let outer_text = "😀\r\nBé";
        let outer_end = outer_start + outer_text.len();
        let candidate = candidate(
            Span::new(outer_start, outer_end),
            vec![
                NormalizationEdit::Insert {
                    at: outer_start,
                    text: "<".to_string(),
                },
                NormalizationEdit::Delete {
                    span: Span::new(outer_start + "😀".len(), outer_start + "😀\r\n".len()),
                },
                NormalizationEdit::Insert {
                    at: outer_end,
                    text: ">".to_string(),
                },
            ],
        );

        let (normalized, segments) = normalize_candidate_source(source, &candidate);

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
}
