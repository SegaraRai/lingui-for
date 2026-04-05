use std::collections::BTreeMap;

use crate::common::{
    FinalizedReplacement, IndexedSourceMap, IndexedText, MappedTextError, RenderedMappedText,
    build_final_output, indent_rendered_text, overlay_source_map_with_single_anchor,
};

use super::adapters::AdapterError;
use super::{
    CompileReplacementInternal, CompileReplacementOutputInternal, FinishedCompileInternal,
    FrameworkCompilePlan,
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
    transformed_declarations: &BTreeMap<String, RenderedMappedText>,
) -> Result<Vec<CompileReplacementInternal>, EmitError> {
    let mut replacements = Vec::new();
    let common = plan.common();
    replacements.extend(common.import_removals.iter().map(|range| {
        CompileReplacementInternal::new(
            format!("__import_remove_{}_{}", range.start, range.end),
            range.start,
            range.end,
            String::new(),
            None,
            Vec::new(),
        )
    }));

    for target in &common.targets {
        let Some(declaration) = transformed_declarations
            .get(&target.declaration_id)
            .cloned()
        else {
            continue;
        };

        let indented = indent_rendered_text(
            declaration,
            get_source_line_indent(source, target.original_span.start),
        )?;

        replacements.push(CompileReplacementInternal::new(
            target.declaration_id.clone(),
            target.original_span.start,
            target.original_span.end,
            indented.code,
            indented.indexed_source_map,
            common
                .source_anchors
                .iter()
                .copied()
                .filter(|anchor| {
                    (*anchor >= target.original_span.start) && (*anchor < target.original_span.end)
                })
                .collect(),
        ));
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
) -> Result<FinishedCompileInternal, EmitError> {
    let mapped =
        assemble_output_with_source_map(source, source_name, source_anchors, &replacements)?;
    let replacements = replacements
        .into_iter()
        .map(CompileReplacementOutputInternal::from)
        .collect();

    Ok(FinishedCompileInternal {
        code: mapped.code,
        source_name: source_name.to_string(),
        source_map: mapped.indexed_source_map,
        replacements,
    })
}

fn assemble_output_with_source_map(
    source: &str,
    source_name: &str,
    source_anchors: &[usize],
    replacements: &[CompileReplacementInternal],
) -> Result<RenderedMappedText, EmitError> {
    let indexed_source = IndexedText::new(source);
    let finalized = replacements
        .iter()
        .map(|replacement| {
            let normalized = replacement
                .indexed_source_map
                .as_ref()
                .map(|map| {
                    normalize_final_replacement_map(
                        map,
                        source_name,
                        &indexed_source,
                        replacement.start,
                    )
                })
                .transpose()?;
            Ok(FinalizedReplacement {
                start: replacement.start,
                end: replacement.end,
                code: replacement.code.as_str(),
                indexed_source_map: normalized,
                original_anchors: replacement.original_anchors.clone(),
            })
        })
        .collect::<Result<Vec<_>, EmitError>>()?;
    build_final_output(source_name, source, source_anchors, &finalized).map_err(EmitError::from)
}

fn normalize_final_replacement_map(
    map: &IndexedSourceMap,
    source_name: &str,
    source: &IndexedText<'_>,
    original_start: usize,
) -> Result<IndexedSourceMap, EmitError> {
    let mut normalized = map.clone();

    if map.source_map().lookup_token(0, 0).is_none() {
        normalized = IndexedSourceMap::new(
            overlay_source_map_with_single_anchor(
                map.source_map(),
                source_name,
                source,
                0,
                0,
                original_start,
            )
            .ok_or(EmitError::MissingReplacementStartAnchor)?,
        );
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
