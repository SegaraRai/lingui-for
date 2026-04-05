mod declarations;
mod indexed_text;
mod lang;
mod normalization;
mod source_map;
mod span;
mod text_search;

pub(crate) use declarations::{
    CollectDeclarationsError, collect_variable_initializer_declarations,
};
pub use indexed_text::{IndexedText, IndexedTextSlice};
pub use lang::ScriptLang;
pub(crate) use normalization::{
    NormalizationEdit, sort_and_dedup_normalization_edits, whitespace_replacement_edits,
};
pub use source_map::MappedTextError;
pub(crate) use source_map::{
    FinalizedReplacement, IndexedSourceMap, MappedText, RenderedMappedText, build_copy_map,
    build_final_output, build_span_anchor_map, compose_source_maps, extract_local_submap,
    indent_rendered_text, overlay_source_map_with_single_anchor, parse_source_map,
    source_map_to_json,
};
pub use span::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
pub(crate) use text_search::find_pattern_near_start;
