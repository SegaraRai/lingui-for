use crate::framework::{MacroCandidate, MacroImport};

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

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
    let mut strips = candidate.strip_spans.clone();
    strips.sort_by_key(|span| span.start);

    let mut generated = String::new();
    let mut segments = Vec::new();
    let mut cursor = candidate.outer_span.start;

    for strip in strips {
        if strip.start > cursor {
            let chunk = &source[cursor..strip.start];
            let generated_start = generated.len();
            generated.push_str(chunk);
            segments.push(NormalizedSegment {
                original_start: cursor,
                generated_start,
                len: chunk.len(),
            });
        }
        cursor = cursor.max(strip.end);
    }

    if cursor < candidate.outer_span.end {
        let chunk = &source[cursor..candidate.outer_span.end];
        let generated_start = generated.len();
        generated.push_str(chunk);
        segments.push(NormalizedSegment {
            original_start: cursor,
            generated_start,
            len: chunk.len(),
        });
    }

    (generated, segments)
}
