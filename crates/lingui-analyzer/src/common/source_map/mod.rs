mod mapped_text;
mod primitives;
mod recipes;

use std::sync::Arc;

use sourcemap::SourceMap;

pub(crate) type SharedSourceMap = Arc<SourceMap>;

pub(crate) use mapped_text::{
    MappedText, MappedTextError, RenderedMappedText, build_segmented_map,
};
pub(crate) use primitives::{
    compose_source_maps, compute_line_starts, extract_local_submap_indexed, index_source_map,
    overlay_source_map_with_single_anchor, parse_source_map, source_map_to_json,
};
pub(crate) use recipes::{
    FinalizedReplacement, build_copy_map, build_final_output, build_span_anchor_map,
    indent_rendered_text,
};
