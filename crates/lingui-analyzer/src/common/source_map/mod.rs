mod mapped_text;
mod primitives;
mod recipes;

pub use mapped_text::MappedTextError;
pub(crate) use mapped_text::{MappedText, RenderedMappedText};
pub(crate) use primitives::{
    IndexedSourceMap, compose_source_maps, extract_local_submap,
    overlay_source_map_with_single_anchor, parse_source_map, source_map_to_json,
};
pub(crate) use recipes::{
    FinalizedReplacement, build_copy_map, build_final_output, build_span_anchor_map,
    indent_rendered_text,
};
