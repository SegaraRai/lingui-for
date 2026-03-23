use std::collections::BTreeMap;
use std::io::Cursor;

use crate::utf16::Utf16Index;
use crate::{
    MacroCandidate, MacroImport, Span, SyntheticMapping, SyntheticModule, model::NormalizedSegment,
};
use sourcemap::SourceMapBuilder;

pub fn build_synthetic_module(
    source: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
) -> SyntheticModule {
    build_synthetic_module_with_names(source, "source", "synthetic.js", imports, candidates)
}

pub fn build_synthetic_module_with_names(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
) -> SyntheticModule {
    let mut out = String::new();
    let mut declaration_ids = Vec::new();
    let mut original_spans = BTreeMap::new();
    let mut generated_spans = BTreeMap::new();
    let mut generated_initializer_offsets = BTreeMap::new();
    let mut normalized_segments = BTreeMap::new();
    let mut source_map_anchors = BTreeMap::new();
    let import_line = render_import_line(imports);

    if let Some(line) = import_line {
        out.push_str(&line);
        out.push('\n');
    }

    for (index, candidate) in candidates.iter().enumerate() {
        let declaration_id = format!("__lf_{index}");
        let normalized = normalize_candidate_source(source, candidate);
        let generated_start = out.len();
        out.push_str("const ");
        out.push_str(&declaration_id);
        out.push_str(" = ");
        let generated_initializer_start = out.len();
        out.push_str(&normalized.code);
        out.push_str(";\n");
        let generated_end = out.len();

        declaration_ids.push(declaration_id.clone());
        original_spans.insert(declaration_id.clone(), candidate.outer_span);
        generated_spans.insert(
            declaration_id.clone(),
            Span::new(generated_start, generated_end),
        );
        generated_initializer_offsets.insert(declaration_id.clone(), generated_initializer_start);
        normalized_segments.insert(declaration_id.clone(), normalized.segments);
        source_map_anchors.insert(declaration_id.clone(), candidate.source_map_anchor);
    }

    let mappings = declaration_ids
        .iter()
        .enumerate()
        .map(|(index, id)| {
            let candidate = &candidates[index];
            SyntheticMapping {
                declaration_id: id.clone(),
                original_span: original_spans[id],
                generated_span: generated_spans[id],
                local_name: candidate.local_name.clone(),
                imported_name: candidate.imported_name.clone(),
                flavor: candidate.flavor,
                source_map_anchor: source_map_anchors[id],
                normalized_segments: normalized_segments[id]
                    .iter()
                    .map(|segment| NormalizedSegment {
                        original_start: segment.original_start,
                        generated_start: segment.generated_start,
                        len: segment.len,
                    })
                    .collect(),
            }
        })
        .collect();

    let source_map_json = build_source_map_json(
        source,
        source_name,
        synthetic_name,
        &out,
        &declaration_ids,
        &generated_initializer_offsets,
        &normalized_segments,
        &source_map_anchors,
    );

    SyntheticModule {
        source: out,
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        source_map_json,
        declaration_ids,
        original_spans,
        generated_spans,
        mappings,
    }
}

fn render_import_line(imports: &[MacroImport]) -> Option<String> {
    let mut grouped = BTreeMap::<&str, Vec<(&str, &str)>>::new();
    for import_decl in imports {
        let specifiers = grouped.entry(import_decl.source.as_str()).or_default();
        let specifier = (
            import_decl.imported_name.as_str(),
            import_decl.local_name.as_str(),
        );
        if !specifiers.contains(&specifier) {
            specifiers.push(specifier);
        }
    }

    if grouped.is_empty() {
        return None;
    }

    let lines = grouped
        .into_iter()
        .map(|(source, specifiers)| {
            let rendered = specifiers
                .into_iter()
                .map(|(imported_name, local_name)| {
                    if imported_name == local_name {
                        local_name.to_string()
                    } else {
                        format!("{imported_name} as {local_name}")
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("import {{ {rendered} }} from \"{source}\";")
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(lines)
}

#[derive(Debug, Clone)]
struct NormalizedCandidate {
    code: String,
    segments: Vec<RetainedSegment>,
}

#[derive(Debug, Clone)]
struct RetainedSegment {
    original_start: usize,
    generated_start: usize,
    len: usize,
}

fn normalize_candidate_source(source: &str, candidate: &MacroCandidate) -> NormalizedCandidate {
    let outer = &source[candidate.outer_span.start..candidate.outer_span.end];
    if candidate.strip_spans.is_empty() {
        return NormalizedCandidate {
            code: outer.to_string(),
            segments: vec![RetainedSegment {
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
            segments.push(RetainedSegment {
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
        segments.push(RetainedSegment {
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

fn build_source_map_json(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    generated_source: &str,
    declaration_ids: &[String],
    generated_initializer_offsets: &BTreeMap<String, usize>,
    normalized_segments: &BTreeMap<String, Vec<RetainedSegment>>,
    source_map_anchors: &BTreeMap<String, Option<Span>>,
) -> Option<String> {
    let mut builder = SourceMapBuilder::new(Some(synthetic_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source));

    let original_line_starts = compute_line_starts(source);
    let generated_line_starts = compute_line_starts(generated_source);
    let original_index = Utf16Index::new(source, &original_line_starts);
    let generated_index = Utf16Index::new(generated_source, &generated_line_starts);

    for declaration_id in declaration_ids {
        let Some(generated_start) = generated_initializer_offsets.get(declaration_id) else {
            continue;
        };

        if let Some(Some(anchor)) = source_map_anchors.get(declaration_id) {
            let declaration_len = declaration_length(declaration_id, normalized_segments);
            for delta in 0..=declaration_len {
                let generated = generated_index.byte_to_line_utf16_col(*generated_start + delta);
                let original = original_index.byte_to_line_utf16_col(anchor.start);
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
            continue;
        }

        let Some(segments) = normalized_segments.get(declaration_id) else {
            continue;
        };

        for segment in segments {
            for delta in 0..=segment.len {
                let generated = generated_index
                    .byte_to_line_utf16_col(generated_start + segment.generated_start + delta);
                let original =
                    original_index.byte_to_line_utf16_col(segment.original_start + delta);
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
    }

    let sourcemap = builder.into_sourcemap();
    let mut out = Cursor::new(Vec::new());
    sourcemap.to_writer(&mut out).ok()?;
    String::from_utf8(out.into_inner()).ok()
}

fn declaration_length(
    declaration_id: &str,
    normalized_segments: &BTreeMap<String, Vec<RetainedSegment>>,
) -> usize {
    normalized_segments
        .get(declaration_id)
        .and_then(|segments| segments.last())
        .map(|segment| segment.generated_start + segment.len)
        .unwrap_or(0)
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
