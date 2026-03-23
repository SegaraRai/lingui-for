use std::io::Cursor;

use sourcemap::SourceMapBuilder;

use crate::utf16::Utf16Index;
use crate::{AnalyzerError, ReinsertedModule, SyntheticModule};

pub fn reinsert_transformed_declarations(
    original_source: &str,
    source_name: &str,
    synthetic_module: &SyntheticModule,
    transformed_declarations: &std::collections::BTreeMap<String, String>,
) -> Result<ReinsertedModule, AnalyzerError> {
    let mut mappings = synthetic_module.mappings.clone();
    mappings.sort_by_key(|mapping| {
        (
            mapping.original_span.start,
            mapping.original_span.end,
            mapping.declaration_id.clone(),
        )
    });

    let mut code = String::new();
    let mut segments = Vec::new();
    let mut cursor = 0usize;

    for mapping in &mappings {
        if mapping.original_span.start < cursor {
            return Err(AnalyzerError::OverlappingMappings(mapping.original_span.start));
        }

        if cursor < mapping.original_span.start {
            let unchanged = &original_source[cursor..mapping.original_span.start];
            let generated_start = code.len();
            code.push_str(unchanged);
            segments.push(MappingSegment {
                generated_start,
                generated_len: unchanged.len(),
                original_start: cursor,
                original_len: unchanged.len(),
            });
        }

        let replacement = transformed_declarations
            .get(&mapping.declaration_id)
            .ok_or_else(|| AnalyzerError::MissingTransformedDeclaration(mapping.declaration_id.clone()))?;
        let generated_start = code.len();
        code.push_str(replacement);
        let original_start = mapping
            .source_map_anchor
            .map(|anchor| anchor.start)
            .or_else(|| {
                mapping
                    .normalized_segments
                    .first()
                    .map(|segment| segment.original_start)
            })
            .unwrap_or(mapping.original_span.start);
        let original_len = mapping.original_span.end.saturating_sub(original_start);
        segments.push(MappingSegment {
            generated_start,
            generated_len: replacement.len(),
            original_start,
            original_len,
        });

        cursor = mapping.original_span.end;
    }

    if cursor < original_source.len() {
        let tail = &original_source[cursor..];
        let generated_start = code.len();
        code.push_str(tail);
        segments.push(MappingSegment {
            generated_start,
            generated_len: tail.len(),
            original_start: cursor,
            original_len: tail.len(),
        });
    }

    Ok(ReinsertedModule {
        code: code.clone(),
        source_name: source_name.to_string(),
        source_map_json: build_reinserted_source_map_json(original_source, source_name, &code, &segments),
    })
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
        for delta in 0..=segment.generated_len {
            let generated = generated_index.byte_to_line_utf16_col(segment.generated_start + delta);
            let original = original_index.byte_to_line_utf16_col(
                segment.original_start + delta.min(segment.original_len),
            );
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
