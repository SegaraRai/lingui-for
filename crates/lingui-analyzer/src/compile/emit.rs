use std::collections::BTreeMap;

use crate::common::{
    FinalizedReplacement, MappedTextError, RenderedMappedText, SharedSourceMap, build_final_output,
    indent_rendered_text, overlay_source_map_with_single_anchor, source_map_to_json,
};

use super::adapters::AdapterError;
use super::lower::LoweredDeclaration;
use super::{
    CompileReplacement, CompileReplacementInternal, FinishedCompile, FrameworkCompilePlan,
};

#[derive(thiserror::Error, Debug)]
pub enum EmitError {
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
    #[error("failed to overlay replacement start anchor")]
    MissingReplacementStartAnchor,
    #[error(transparent)]
    Adapter(#[from] AdapterError),
}

pub(crate) fn collect_compile_replacements_internal<P: FrameworkCompilePlan>(
    plan: &P,
    source: &str,
    transformed_declarations: &BTreeMap<String, LoweredDeclaration>,
) -> Result<Vec<CompileReplacementInternal>, EmitError> {
    let mut replacements = Vec::new();
    let common = plan.common();
    replacements.extend(
        common
            .import_removals
            .iter()
            .map(|range| CompileReplacementInternal {
                declaration_id: format!("__import_remove_{}_{}", range.start, range.end),
                start: range.start,
                end: range.end,
                code: String::new(),
                source_map: None,
                original_anchors: Vec::new(),
            }),
    );

    for target in &common.targets {
        let Some(declaration) = transformed_declarations.get(&target.declaration_id) else {
            continue;
        };

        let indented = indent_rendered_text(
            common.source_name.as_str(),
            source,
            RenderedMappedText {
                code: declaration.code.clone(),
                source_map: declaration.source_map.clone(),
            },
            get_source_line_indent(source, target.original_span.start),
        )?;

        replacements.push(CompileReplacementInternal {
            declaration_id: target.declaration_id.clone(),
            start: target.original_span.start,
            end: target.original_span.end,
            source_map: indented.source_map,
            code: indented.code,
            original_anchors: common
                .source_anchors
                .iter()
                .copied()
                .filter(|anchor| {
                    (*anchor >= target.original_span.start) && (*anchor < target.original_span.end)
                })
                .collect(),
        });
    }

    plan.append_runtime_injection_replacements(source, &mut replacements)?;

    replacements.sort_by_key(|replacement| (replacement.start, replacement.end));
    Ok(replacements)
}

pub(crate) fn finish_compile_from_internal_replacements(
    source: &str,
    source_name: &str,
    source_anchors: &[usize],
    replacements: Vec<CompileReplacementInternal>,
) -> Result<FinishedCompile, EmitError> {
    let mapped =
        assemble_output_with_source_map(source, source_name, source_anchors, &replacements)?;
    let replacements = replacements
        .into_iter()
        .map(|replacement| CompileReplacement {
            declaration_id: replacement.declaration_id,
            start: replacement.start,
            end: replacement.end,
            code: replacement.code,
            source_map_json: replacement
                .source_map
                .as_ref()
                .and_then(|map| source_map_to_json(map)),
        })
        .collect();

    Ok(FinishedCompile {
        code: mapped.code,
        source_name: source_name.to_string(),
        source_map_json: mapped
            .source_map
            .as_ref()
            .and_then(|map| source_map_to_json(map)),
        replacements,
    })
}

fn assemble_output_with_source_map(
    source: &str,
    source_name: &str,
    source_anchors: &[usize],
    replacements: &[CompileReplacementInternal],
) -> Result<RenderedMappedText, EmitError> {
    let finalized = replacements
        .iter()
        .map(|replacement| {
            let normalized = replacement
                .source_map
                .as_ref()
                .map(|map| {
                    normalize_final_replacement_map(map, source_name, source, replacement.start)
                })
                .transpose()?;
            Ok(FinalizedReplacement {
                start: replacement.start,
                end: replacement.end,
                code: replacement.code.as_str(),
                source_map: normalized,
                original_anchors: replacement.original_anchors.clone(),
            })
        })
        .collect::<Result<Vec<_>, EmitError>>()?;
    build_final_output(source_name, source, source_anchors, &finalized).map_err(EmitError::from)
}

fn normalize_final_replacement_map(
    map: &SharedSourceMap,
    source_name: &str,
    source: &str,
    original_start: usize,
) -> Result<SharedSourceMap, EmitError> {
    let mut normalized = map.clone();

    if map.lookup_token(0, 0).is_none() {
        normalized =
            overlay_source_map_with_single_anchor(map, source_name, source, 0, 0, original_start)
                .ok_or(EmitError::MissingReplacementStartAnchor)?;
    }

    Ok(normalized)
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
