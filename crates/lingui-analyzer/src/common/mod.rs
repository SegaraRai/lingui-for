mod indexed_text;
mod lang;
mod source_map;
mod span;
mod transformed_declaration;

pub use indexed_text::{IndexedText, IndexedTextSlice};
pub use lang::ScriptLang;
pub use source_map::MappedTextError;
pub(crate) use source_map::{
    FinalizedReplacement, IndexedSourceMap, MappedText, RenderedMappedText, build_copy_map,
    build_final_output, build_segmented_map, build_span_anchor_map, compose_source_maps,
    extract_local_submap, indent_rendered_text, overlay_source_map_with_single_anchor,
    parse_source_map, source_map_to_json,
};
pub use span::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
pub(crate) use transformed_declaration::{
    CollectDeclarationsError, TransformedDeclaration, collect_variable_initializer_declarations,
    initializer_start_for_declarator,
};
