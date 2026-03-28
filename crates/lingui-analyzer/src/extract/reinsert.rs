use std::collections::BTreeMap;
use std::io::Cursor;

use sourcemap::SourceMapBuilder;

use crate::common::{Span, Utf16Index};
use crate::extract::{ReinsertedModule, ReplacementChunk, SyntheticModule};
use crate::synthesis::NormalizedSegment;

#[derive(thiserror::Error, Debug)]
pub enum ReinsertError {
    #[error("missing transformed declaration: {0}")]
    MissingTransformedDeclaration(String),
    #[error("synthetic mappings overlap around byte {0}")]
    OverlappingMappings(usize),
}

pub fn reinsert_transformed_declarations(
    original_source: &str,
    source_name: &str,
    synthetic_module: &SyntheticModule,
    transformed_declarations: &BTreeMap<String, String>,
) -> Result<ReinsertedModule, ReinsertError> {
    let mut chunks =
        build_replacement_chunks(&synthetic_module.mappings, transformed_declarations)?;
    chunks.sort_by_key(|chunk| {
        (
            chunk.original_span.start,
            chunk.original_span.end,
            chunk.declaration_id.clone(),
        )
    });

    let assembly = assemble_reinserted_output(original_source, &chunks)?;

    Ok(ReinsertedModule {
        code: assembly.code.clone(),
        source_name: source_name.to_string(),
        source_map_json: build_reinserted_source_map_json(
            original_source,
            source_name,
            &assembly.code,
            &assembly.mapping_segments,
        ),
    })
}

fn build_replacement_chunks(
    mappings: &[crate::extract::SyntheticMapping],
    transformed_declarations: &BTreeMap<String, String>,
) -> Result<Vec<ReplacementChunk>, ReinsertError> {
    mappings
        .iter()
        .map(|mapping| {
            let replacement = transformed_declarations
                .get(&mapping.declaration_id)
                .ok_or_else(|| {
                    ReinsertError::MissingTransformedDeclaration(mapping.declaration_id.clone())
                })?
                .clone();

            Ok(ReplacementChunk {
                declaration_id: mapping.declaration_id.clone(),
                original_span: mapping.original_span,
                replacement,
                source_map_anchor: mapping.source_map_anchor,
                normalized_segments: mapping.normalized_segments.clone(),
            })
        })
        .collect()
}

fn assemble_reinserted_output(
    original_source: &str,
    chunks: &[ReplacementChunk],
) -> Result<ReinsertedAssembly, ReinsertError> {
    let mut code = String::new();
    let mut mapping_segments = Vec::new();
    let mut cursor = 0usize;

    for chunk in chunks {
        if chunk.original_span.start < cursor {
            return Err(ReinsertError::OverlappingMappings(
                chunk.original_span.start,
            ));
        }

        if cursor < chunk.original_span.start {
            push_unchanged_chunk(
                original_source,
                Span::new(cursor, chunk.original_span.start),
                &mut code,
                &mut mapping_segments,
            );
        }

        push_replacement_chunk(chunk, &mut code, &mut mapping_segments);
        cursor = chunk.original_span.end;
    }

    if cursor < original_source.len() {
        push_unchanged_chunk(
            original_source,
            Span::new(cursor, original_source.len()),
            &mut code,
            &mut mapping_segments,
        );
    }

    Ok(ReinsertedAssembly {
        code,
        mapping_segments,
    })
}

fn push_unchanged_chunk(
    original_source: &str,
    span: Span,
    code: &mut String,
    mapping_segments: &mut Vec<MappingSegment>,
) {
    let unchanged = &original_source[span.start..span.end];
    let generated_start = code.len();
    code.push_str(unchanged);
    mapping_segments.push(MappingSegment {
        generated_start,
        generated_len: unchanged.len(),
        original_start: span.start,
        original_len: unchanged.len(),
    });
}

fn push_replacement_chunk(
    chunk: &ReplacementChunk,
    code: &mut String,
    mapping_segments: &mut Vec<MappingSegment>,
) {
    let generated_start = code.len();
    code.push_str(&chunk.replacement);
    let original_start = chunk
        .normalized_segments
        .first()
        .map(|segment| segment.original_start)
        .or_else(|| chunk.source_map_anchor.map(|anchor| anchor.start))
        .unwrap_or(chunk.original_span.start);
    let original_len = original_length_for_chunk(chunk, original_start);

    mapping_segments.push(MappingSegment {
        generated_start,
        generated_len: chunk.replacement.len(),
        original_start,
        original_len,
    });
}

fn original_length_for_chunk(chunk: &ReplacementChunk, original_start: usize) -> usize {
    chunk
        .normalized_segments
        .last()
        .map(end_of_normalized_segment)
        .unwrap_or(chunk.original_span.end)
        .saturating_sub(original_start)
}

fn end_of_normalized_segment(segment: &NormalizedSegment) -> usize {
    segment.original_start + segment.len
}

#[derive(Debug, Clone)]
struct ReinsertedAssembly {
    code: String,
    mapping_segments: Vec<MappingSegment>,
}

#[derive(Debug, Clone, Copy)]
struct MappingSegment {
    generated_start: usize,
    generated_len: usize,
    original_start: usize,
    original_len: usize,
}

fn build_reinserted_source_map_json(
    original_source: &str,
    source_name: &str,
    generated_source: &str,
    segments: &[MappingSegment],
) -> Option<String> {
    let mut builder = SourceMapBuilder::new(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(original_source));

    let original_line_starts = compute_line_starts(original_source);
    let generated_line_starts = compute_line_starts(generated_source);
    let original_index = Utf16Index::new(original_source, &original_line_starts);
    let generated_index = Utf16Index::new(generated_source, &generated_line_starts);

    for segment in segments {
        for delta in 0..segment.generated_len {
            let generated = generated_index.byte_to_line_utf16_col(segment.generated_start + delta);
            let original = original_index
                .byte_to_line_utf16_col(segment.original_start + delta.min(segment.original_len));
            builder.add(
                generated.0 as u32,
                generated.1 as u32,
                original.0 as u32,
                original.1 as u32,
                Some(source_name),
                None,
                false,
            );
        }
    }

    let generated_end = generated_index.byte_to_line_utf16_col(generated_source.len());
    let original_end = original_index.byte_to_line_utf16_col(original_source.len());
    builder.add(
        generated_end.0 as u32,
        generated_end.1 as u32,
        original_end.0 as u32,
        original_end.1 as u32,
        Some(source_name),
        None,
        false,
    );

    let sourcemap = builder.into_sourcemap();
    let mut out = Cursor::new(Vec::new());
    sourcemap.to_writer(&mut out).ok()?;
    String::from_utf8(out.into_inner()).ok()
}

fn compute_line_starts(source: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (index, byte) in source.bytes().enumerate() {
        if byte == b'\n' {
            starts.push(index + 1);
        }
    }
    starts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacement_chunks_use_normalized_segments_before_outer_span() {
        let chunk = ReplacementChunk {
            declaration_id: "__lf_0".to_string(),
            original_span: Span::new(10, 30),
            replacement: "runtime()".to_string(),
            source_map_anchor: None,
            normalized_segments: vec![
                NormalizedSegment {
                    original_start: 11,
                    generated_start: 0,
                    len: 9,
                },
                NormalizedSegment {
                    original_start: 25,
                    generated_start: 9,
                    len: 2,
                },
            ],
        };

        let mut code = String::new();
        let mut mapping_segments = Vec::new();
        push_replacement_chunk(&chunk, &mut code, &mut mapping_segments);

        assert_eq!(code, "runtime()");
        assert_eq!(mapping_segments.len(), 1);
        assert_eq!(mapping_segments[0].original_start, 11);
        assert_eq!(mapping_segments[0].original_len, 16);
    }
}
