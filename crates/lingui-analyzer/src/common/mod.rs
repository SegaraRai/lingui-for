mod lang;
mod source_map;
mod span;
mod transformed_declaration;
mod utf16;

pub use lang::ScriptLang;
pub(crate) use source_map::{
    FinalizedReplacement, MappedText, MappedTextError, RenderedMappedText, SharedSourceMap,
    build_copy_map, build_final_output, build_segmented_map, build_span_anchor_map,
    compose_source_maps, compute_line_starts, extract_local_submap_indexed, indent_rendered_text,
    index_source_map, overlay_source_map_with_single_anchor, parse_source_map, source_map_to_json,
};
pub use span::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
pub(crate) use transformed_declaration::{
    CollectDeclarationsError, TransformedDeclaration, collect_variable_initializer_declarations,
    extend_start_for_leading_comments,
};
pub use utf16::Utf16Index;
