use lean_string::LeanString;

use crate::common::{
    CollectDeclarationsError, FinalizedReplacement, IndexedSourceMap, MappedTextError,
    build_final_output, collect_variable_initializer_declarations, parse_source_map,
    source_map_to_json,
};
use crate::extract::{ExtractTransformedProgram, ReinsertedModule, SyntheticModule};

#[derive(thiserror::Error, Debug)]
pub enum ReinsertError {
    #[error("missing transformed declaration: {0}")]
    MissingTransformedDeclaration(LeanString),
    #[error("synthetic mappings overlap around byte {0}")]
    OverlappingMappings(usize),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
    #[error(transparent)]
    CollectDeclarations(#[from] CollectDeclarationsError),
}

pub fn reinsert_transformed_declarations(
    original_source: &LeanString,
    source_name: &LeanString,
    synthetic_module: &SyntheticModule,
    transformed_program: &ExtractTransformedProgram,
) -> Result<ReinsertedModule, ReinsertError> {
    let transformed_program_map = transformed_program
        .source_map_json
        .as_deref()
        .and_then(parse_source_map)
        .map(IndexedSourceMap::new);
    let transformed_declarations = collect_variable_initializer_declarations(
        &transformed_program.code,
        transformed_program_map.as_ref(),
    )?;
    let mut mappings = synthetic_module.mappings.clone();
    mappings.sort_by_key(|mapping| {
        (
            mapping.original_span.start,
            mapping.original_span.end,
            mapping.declaration_id.clone(),
        )
    });
    let mut finalized = Vec::new();

    for mapping in &mappings {
        if finalized
            .last()
            .is_some_and(|last: &FinalizedReplacement<'_>| mapping.original_span.start < last.end)
        {
            return Err(ReinsertError::OverlappingMappings(
                mapping.original_span.start,
            ));
        }

        let replacement = transformed_declarations
            .get(&mapping.declaration_id)
            .ok_or_else(|| {
                ReinsertError::MissingTransformedDeclaration(mapping.declaration_id.clone())
            })?;
        finalized.push(FinalizedReplacement {
            start: mapping.original_span.start,
            end: mapping.original_span.end,
            code: replacement.code.as_str(),
            indexed_source_map: replacement.indexed_source_map.clone(),
            original_anchors: synthetic_module
                .source_anchors
                .iter()
                .copied()
                .filter(|anchor| {
                    (*anchor >= mapping.original_span.start)
                        && (*anchor < mapping.original_span.end)
                })
                .collect(),
        });
    }
    let rendered = build_final_output(
        source_name,
        original_source,
        &synthetic_module.source_anchors,
        &finalized,
    )?;
    Ok(ReinsertedModule {
        code: rendered.code,
        source_name: source_name.clone(),
        source_map_json: rendered
            .indexed_source_map
            .as_ref()
            .and_then(|map| source_map_to_json(map.source_map()))
            .map(LeanString::from),
    })
}
