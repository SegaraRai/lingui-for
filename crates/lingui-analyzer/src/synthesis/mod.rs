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

    for edit in &candidate.normalization_edits {
        match edit {
            NormalizationEdit::Delete { span } => {
                let start = span.start.max(candidate.outer_span.start).min(source_len);
                let end = span.end.max(candidate.outer_span.start).min(source_len);
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

        while *insertion_index < insertions.len() && insertions[*insertion_index].0 == cursor {
            generated.push_str(&insertions[*insertion_index].1);
            *insertion_index += 1;
        }
    }
}
