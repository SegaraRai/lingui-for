use std::collections::BTreeMap;
use std::io::Cursor;

use sourcemap::SourceMapBuilder;

use crate::common::{Span, Utf16Index};
use crate::extract::{SyntheticMapping, SyntheticModule};
use crate::framework::{MacroCandidate, MacroCandidateKind, MacroImport};
use crate::synthesis::{NormalizedSegment, SynthesisPlan, build_synthesis_plan};

#[derive(thiserror::Error, Debug)]
pub enum BuildSyntheticModuleError {
    #[error("synthetic target should exist")]
    MissingSyntheticTarget,
}

pub fn build_synthetic_module(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
) -> Result<SyntheticModule, BuildSyntheticModuleError> {
    let plan = build_synthesis_plan(source, imports, candidates);
    build_synthetic_module_from_plan(source, source_name, synthetic_name, &plan)
}

pub fn build_synthetic_module_from_plan(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    plan: &SynthesisPlan,
) -> Result<SyntheticModule, BuildSyntheticModuleError> {
    let mut out = String::new();
    let mut declaration_ids = Vec::new();
    let mut original_spans = BTreeMap::new();
    let mut generated_spans = BTreeMap::new();
    let mut generated_initializer_offsets = BTreeMap::new();
    let mut normalized_segments = BTreeMap::new();
    let mut source_map_anchors = BTreeMap::new();
    let mut candidate_kinds = BTreeMap::new();
    let import_line = render_import_line(&plan.imports);

    if let Some(line) = import_line {
        out.push_str(&line);
        out.push('\n');
    }

    for target in &plan.targets {
        let declaration_id = target.declaration_id.clone();
        let generated_start = out.len();
        out.push_str("const ");
        out.push_str(&declaration_id);
        out.push_str(" = ");
        let generated_initializer_start = out.len();
        out.push_str(&target.normalized_code);
        out.push_str(";\n");
        let generated_end = out.len();

        declaration_ids.push(declaration_id.clone());
        original_spans.insert(declaration_id.clone(), target.candidate.outer_span);
        generated_spans.insert(
            declaration_id.clone(),
            Span::new(generated_start, generated_end),
        );
        generated_initializer_offsets.insert(declaration_id.clone(), generated_initializer_start);
        normalized_segments.insert(declaration_id.clone(), target.normalized_segments.clone());
        source_map_anchors.insert(declaration_id.clone(), target.candidate.source_map_anchor);
        candidate_kinds.insert(declaration_id.clone(), target.candidate.kind);
    }

    let mappings = declaration_ids
        .iter()
        .map(|id| {
            let target = plan
                .targets
                .iter()
                .find(|target| target.declaration_id == *id)
                .ok_or(BuildSyntheticModuleError::MissingSyntheticTarget)?;
            Ok(SyntheticMapping {
                declaration_id: id.clone(),
                original_span: original_spans[id],
                generated_span: generated_spans[id],
                local_name: target.candidate.local_name.clone(),
                imported_name: target.candidate.imported_name.clone(),
                flavor: target.candidate.flavor,
                source_map_anchor: source_map_anchors[id],
                normalized_segments: normalized_segments[id].clone(),
            })
        })
        .collect::<Result<_, BuildSyntheticModuleError>>()?;

    let source_map_json = build_source_map_json(
        source,
        source_name,
        synthetic_name,
        &out,
        &declaration_ids,
        &SyntheticSourceMapContext {
            generated_initializer_offsets,
            normalized_segments,
            source_map_anchors,
            candidate_kinds,
        },
    );

    Ok(SyntheticModule {
        source: out,
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        source_map_json,
        declaration_ids,
        original_spans,
        generated_spans,
        mappings,
    })
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

struct SyntheticSourceMapContext {
    generated_initializer_offsets: BTreeMap<String, usize>,
    normalized_segments: BTreeMap<String, Vec<NormalizedSegment>>,
    source_map_anchors: BTreeMap<String, Option<Span>>,
    candidate_kinds: BTreeMap<String, MacroCandidateKind>,
}

fn build_source_map_json(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    generated_source: &str,
    declaration_ids: &[String],
    context: &SyntheticSourceMapContext,
) -> Option<String> {
    let mut builder = SourceMapBuilder::new(Some(synthetic_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source));

    let original_line_starts = compute_line_starts(source);
    let generated_line_starts = compute_line_starts(generated_source);
    let original_index = Utf16Index::new(source, &original_line_starts);
    let generated_index = Utf16Index::new(generated_source, &generated_line_starts);

    for declaration_id in declaration_ids {
        let Some(generated_start) = context.generated_initializer_offsets.get(declaration_id)
        else {
            continue;
        };
        let Some(candidate_kind) = context.candidate_kinds.get(declaration_id) else {
            continue;
        };

        let mut component_prefix_override = 0usize;
        if let Some(Some(anchor)) = context.source_map_anchors.get(declaration_id) {
            if *candidate_kind == MacroCandidateKind::Component {
                if let Some(first_segment) = context
                    .normalized_segments
                    .get(declaration_id)
                    .and_then(|segments| segments.first())
                {
                    let prefix_len = anchor.start.saturating_sub(first_segment.original_start);
                    component_prefix_override = prefix_len;
                    for delta in 0..=prefix_len {
                        let generated =
                            generated_index.byte_to_line_utf16_col(*generated_start + delta);
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
                }
            } else {
                let declaration_len =
                    declaration_length(declaration_id, &context.normalized_segments);
                for delta in 0..=declaration_len {
                    let generated =
                        generated_index.byte_to_line_utf16_col(*generated_start + delta);
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
        }

        let Some(segments) = context.normalized_segments.get(declaration_id) else {
            continue;
        };

        for segment in segments {
            let skip = if *candidate_kind == MacroCandidateKind::Component
                && segment.generated_start == 0
            {
                component_prefix_override.min(segment.len + 1)
            } else {
                0
            };
            for delta in skip..=segment.len {
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
    normalized_segments: &BTreeMap<String, Vec<NormalizedSegment>>,
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
