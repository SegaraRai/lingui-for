use std::collections::BTreeMap;
use std::io::Cursor;

use sourcemap::{SourceMap, SourceMapBuilder};

use crate::AnalyzerError;
use crate::common::Utf16Index;
use crate::compile::adapters::FrameworkCompileAdapter;
use crate::compile::{CompilePlan, CompileReplacement, CompileTarget, FinishedCompile};
use crate::plan::NormalizedSegment;

pub(crate) fn collect_compile_replacements(
    adapter: &dyn FrameworkCompileAdapter,
    plan: &CompilePlan,
    source: &str,
    transformed_declarations: &BTreeMap<String, String>,
) -> Result<Vec<CompileReplacement>, AnalyzerError> {
    let mut replacements = Vec::new();

    replacements.extend(plan.import_removals.iter().map(|range| CompileReplacement {
        declaration_id: format!("__import_remove_{}_{}", range.start, range.end),
        start: range.start,
        end: range.end,
        code: String::new(),
        source_map_json: None,
    }));

    for target in &plan.targets {
        let Some(code) = transformed_declarations.get(&target.declaration_id) else {
            continue;
        };

        let indented = indent_multiline_replacement(
            code,
            get_source_line_indent(source, target.original_span.start),
        );
        replacements.push(CompileReplacement {
            declaration_id: target.declaration_id.clone(),
            start: target.original_span.start,
            end: target.original_span.end,
            source_map_json: build_replacement_source_map_json(
                source,
                &plan.source_name,
                &indented,
                target,
            ),
            code: indented,
        });
    }

    adapter.append_runtime_injection_replacements(plan, source, &mut replacements)?;

    replacements.sort_by_key(|replacement| (replacement.start, replacement.end));
    Ok(replacements)
}

pub fn finish_compile_from_replacements(
    source: &str,
    source_name: &str,
    replacements: Vec<CompileReplacement>,
) -> Result<FinishedCompile, AnalyzerError> {
    let (code, source_map_json) =
        assemble_output_with_source_map(source, source_name, &replacements)?;

    Ok(FinishedCompile {
        code,
        source_name: source_name.to_string(),
        source_map_json: Some(source_map_json),
        replacements,
    })
}

fn assemble_output_with_source_map(
    source: &str,
    source_name: &str,
    replacements: &[CompileReplacement],
) -> Result<(String, String), AnalyzerError> {
    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source));

    let mut cursor = 0;
    let mut code = String::new();
    let mut offset = GeneratedOffset::default();

    for replacement in replacements {
        if replacement.start < cursor {
            continue;
        }

        let untouched = &source[cursor..replacement.start];
        code.push_str(untouched);
        add_untouched_chunk_mappings(
            &mut builder,
            source_name,
            source,
            cursor,
            replacement.start,
            offset,
        );
        offset = advance_generated_offset(offset, untouched);

        code.push_str(&replacement.code);
        if let Some(map_json) = &replacement.source_map_json {
            apply_chunk_mappings(&mut builder, map_json, offset)?;
        } else {
            add_boundary_replacement_mappings(
                &mut builder,
                source_name,
                source,
                replacement,
                offset,
            );
        }
        offset = advance_generated_offset(offset, &replacement.code);
        cursor = replacement.end;
    }

    let tail = &source[cursor..];
    code.push_str(tail);
    add_untouched_chunk_mappings(
        &mut builder,
        source_name,
        source,
        cursor,
        source.len(),
        offset,
    );

    let sourcemap = builder.into_sourcemap();
    let mut out = Cursor::new(Vec::new());
    sourcemap
        .to_writer(&mut out)
        .map_err(|error| AnalyzerError::InvalidSourceMap(error.to_string()))?;
    let json = String::from_utf8(out.into_inner())
        .map_err(|error| AnalyzerError::InvalidSourceMap(error.to_string()))?;

    Ok((code, json))
}

fn add_untouched_chunk_mappings(
    builder: &mut SourceMapBuilder,
    source_name: &str,
    source: &str,
    start: usize,
    end: usize,
    offset: GeneratedOffset,
) {
    if end <= start {
        return;
    }

    let snippet = &source[start..end];
    let original_line_starts = compute_line_starts(source);
    let snippet_line_starts = compute_line_starts(snippet);
    let original_index = Utf16Index::new(source, &original_line_starts);
    let snippet_index = Utf16Index::new(snippet, &snippet_line_starts);

    for snippet_offset in 0..=snippet.len() {
        let generated = snippet_index.byte_to_line_utf16_col(snippet_offset);
        let original = original_index.byte_to_line_utf16_col(start + snippet_offset);
        builder.add(
            generated.0 as u32 + offset.line,
            if generated.0 == 0 {
                generated.1 as u32 + offset.column
            } else {
                generated.1 as u32
            },
            original.0 as u32,
            original.1 as u32,
            Some(source_name),
            None,
            false,
        );
    }
}

fn apply_chunk_mappings(
    builder: &mut SourceMapBuilder,
    map_json: &str,
    offset: GeneratedOffset,
) -> Result<(), AnalyzerError> {
    let map = SourceMap::from_slice(map_json.as_bytes())
        .map_err(|error| AnalyzerError::InvalidSourceMap(error.to_string()))?;

    for token in map.tokens() {
        let Some(source) = token.get_source() else {
            continue;
        };
        let generated_line = offset.line + token.get_dst_line();
        let generated_col = if token.get_dst_line() == 0 {
            offset.column + token.get_dst_col()
        } else {
            token.get_dst_col()
        };

        if let Some(name) = token.get_name() {
            builder.add(
                generated_line,
                generated_col,
                token.get_src_line(),
                token.get_src_col(),
                Some(source),
                Some(name),
                false,
            );
        } else {
            builder.add(
                generated_line,
                generated_col,
                token.get_src_line(),
                token.get_src_col(),
                Some(source),
                None::<&str>,
                false,
            );
        }
    }

    Ok(())
}

fn add_boundary_replacement_mappings(
    builder: &mut SourceMapBuilder,
    source_name: &str,
    source: &str,
    replacement: &CompileReplacement,
    offset: GeneratedOffset,
) {
    if replacement.code.is_empty() && replacement.start == replacement.end {
        return;
    }

    let original_line_starts = compute_line_starts(source);
    let original_index = Utf16Index::new(source, &original_line_starts);
    let generated_line_starts = compute_line_starts(&replacement.code);
    let generated_index = Utf16Index::new(&replacement.code, &generated_line_starts);

    if replacement.code.is_empty() {
        let original = original_index.byte_to_line_utf16_col(replacement.end);
        builder.add(
            offset.line,
            offset.column,
            original.0 as u32,
            original.1 as u32,
            Some(source_name),
            None,
            false,
        );
        return;
    }

    let start_original = original_index.byte_to_line_utf16_col(replacement.start);
    builder.add(
        offset.line,
        offset.column,
        start_original.0 as u32,
        start_original.1 as u32,
        Some(source_name),
        None,
        false,
    );

    for (index, byte) in replacement.code.bytes().enumerate() {
        if byte == b'\n' && index + 1 < replacement.code.len() {
            let generated = generated_index.byte_to_line_utf16_col(index + 1);
            builder.add(
                generated.0 as u32 + offset.line,
                if generated.0 == 0 {
                    generated.1 as u32 + offset.column
                } else {
                    generated.1 as u32
                },
                start_original.0 as u32,
                start_original.1 as u32,
                Some(source_name),
                None,
                false,
            );
        }
    }

    let end_generated = generated_index.byte_to_line_utf16_col(replacement.code.len());
    let end_original = original_index.byte_to_line_utf16_col(replacement.end);
    builder.add(
        end_generated.0 as u32 + offset.line,
        if end_generated.0 == 0 {
            end_generated.1 as u32 + offset.column
        } else {
            end_generated.1 as u32
        },
        end_original.0 as u32,
        end_original.1 as u32,
        Some(source_name),
        None,
        false,
    );
}

#[derive(Debug, Clone, Copy, Default)]
struct GeneratedOffset {
    line: u32,
    column: u32,
}

fn build_replacement_source_map_json(
    original_source: &str,
    source_name: &str,
    replacement: &str,
    target: &CompileTarget,
) -> Option<String> {
    if replacement.is_empty() {
        return None;
    }

    let original_start = target
        .normalized_segments
        .first()
        .map(|segment| segment.original_start)
        .or_else(|| target.source_map_anchor.map(|anchor| anchor.start))
        .unwrap_or(target.original_span.start);
    let original_end = target
        .normalized_segments
        .last()
        .map(end_of_normalized_segment)
        .unwrap_or(target.original_span.end);
    let original_length = original_end.saturating_sub(original_start);

    let mut builder = SourceMapBuilder::new(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(original_source));

    let original_line_starts = compute_line_starts(original_source);
    let generated_line_starts = compute_line_starts(replacement);
    let original_index = Utf16Index::new(original_source, &original_line_starts);
    let generated_index = Utf16Index::new(replacement, &generated_line_starts);

    for offset in 0..=replacement.len() {
        let generated = generated_index.byte_to_line_utf16_col(offset);
        let original =
            original_index.byte_to_line_utf16_col(original_start + offset.min(original_length));
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

    let sourcemap = builder.into_sourcemap();
    let mut out = Cursor::new(Vec::new());
    sourcemap.to_writer(&mut out).ok()?;
    String::from_utf8(out.into_inner()).ok()
}

fn get_source_line_indent(source: &str, offset: usize) -> &str {
    let line_start = source[..offset]
        .rfind('\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    let mut index = line_start;

    while matches!(source.as_bytes().get(index), Some(b' ' | b'\t')) {
        index += 1;
    }

    &source[line_start..index]
}

fn indent_multiline_replacement(code: &str, indent: &str) -> String {
    if indent.is_empty() || !code.contains('\n') {
        return code.to_string();
    }

    code.split('\n')
        .enumerate()
        .map(|(index, line)| {
            if index == 0 || line.is_empty() {
                line.to_string()
            } else {
                format!("{indent}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn end_of_normalized_segment(segment: &NormalizedSegment) -> usize {
    segment.original_start + segment.len
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

fn advance_generated_offset(current: GeneratedOffset, code: &str) -> GeneratedOffset {
    let mut line = current.line;
    let mut column = current.column;

    for ch in code.chars() {
        if ch == '\n' {
            line += 1;
            column = 0;
        } else {
            column += ch.len_utf16() as u32;
        }
    }

    GeneratedOffset { line, column }
}
