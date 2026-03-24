use serde::{Deserialize, Serialize};

use crate::framework::{MacroCandidate, MacroImport};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedSegment {
    pub original_start: usize,
    pub generated_start: usize,
    pub len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntheticTargetPlan {
    pub declaration_id: String,
    pub candidate: MacroCandidate,
    pub normalized_code: String,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntheticPlan {
    pub imports: Vec<MacroImport>,
    pub targets: Vec<SyntheticTargetPlan>,
}

pub fn build_synthetic_plan(
    source: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
) -> SyntheticPlan {
    let targets = candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| {
            let declaration_id = format!("__lf_{index}");
            let normalized = normalize_candidate_source(source, candidate);
            SyntheticTargetPlan {
                declaration_id,
                candidate: candidate.clone(),
                normalized_code: normalized.code,
                normalized_segments: normalized.segments,
            }
        })
        .collect();

    SyntheticPlan {
        imports: imports.to_vec(),
        targets,
    }
}

#[derive(Debug, Clone)]
struct NormalizedCandidate {
    code: String,
    segments: Vec<NormalizedSegment>,
}

fn normalize_candidate_source(source: &str, candidate: &MacroCandidate) -> NormalizedCandidate {
    let outer = &source[candidate.outer_span.start..candidate.outer_span.end];
    if candidate.strip_spans.is_empty() {
        return NormalizedCandidate {
            code: outer.to_string(),
            segments: vec![NormalizedSegment {
                original_start: candidate.outer_span.start,
                generated_start: 0,
                len: outer.len(),
            }],
        };
    }

    let mut output = String::new();
    let mut segments = Vec::new();
    let mut cursor = candidate.outer_span.start;
    let mut generated_cursor = 0;
    let mut strips = candidate.strip_spans.clone();
    strips.sort_by_key(|span| span.start);

    for strip in strips {
        if cursor < strip.start {
            let retained = &source[cursor..strip.start];
            output.push_str(retained);
            segments.push(NormalizedSegment {
                original_start: cursor,
                generated_start: generated_cursor,
                len: retained.len(),
            });
            generated_cursor += retained.len();
        }
        cursor = strip.end.max(cursor);
    }

    if cursor < candidate.outer_span.end {
        let retained = &source[cursor..candidate.outer_span.end];
        output.push_str(retained);
        segments.push(NormalizedSegment {
            original_start: cursor,
            generated_start: generated_cursor,
            len: retained.len(),
        });
    }

    NormalizedCandidate {
        code: output,
        segments,
    }
}
