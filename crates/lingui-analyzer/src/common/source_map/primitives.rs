use std::collections::BTreeSet;
use std::io::Cursor;
use std::sync::Arc;

use sourcemap::{SourceMap, SourceMapBuilder};

use crate::common::{MappedTextError, SharedSourceMap, Utf16Index};

pub(crate) fn parse_source_map(json: &str) -> Option<SharedSourceMap> {
    SourceMap::from_slice(json.as_bytes()).ok().map(Arc::new)
}

pub(crate) fn source_map_to_json(map: &SourceMap) -> Option<String> {
    let mut out = Cursor::new(Vec::new());
    map.to_writer(&mut out).ok()?;
    String::from_utf8(out.into_inner()).ok()
}

pub(crate) fn overlay_source_map_with_single_anchor(
    base: &SourceMap,
    source_name: &str,
    source_text: &str,
    generated_line: u32,
    generated_col: u32,
    original_byte: usize,
) -> Option<SharedSourceMap> {
    let mut builder = SourceMapBuilder::new(base.get_file());
    builder.set_file(base.get_file());
    builder.set_source_root(base.get_source_root());

    for src_id in 0..base.get_source_count() {
        let source = base.get_source(src_id)?;
        let builder_src_id = builder.add_source(source);
        builder.set_source_contents(builder_src_id, base.get_source_contents(src_id));
    }

    let line_starts = compute_line_starts(source_text);
    let source_index = Utf16Index::new(source_text, &line_starts);
    let (src_line, src_col) = source_index.byte_to_line_utf16_col(original_byte);

    let mut inserted = false;
    let mut seen = BTreeSet::new();
    for token in base.tokens() {
        if !inserted
            && (token.get_dst_line(), token.get_dst_col()) >= (generated_line, generated_col)
        {
            builder.add(
                generated_line,
                generated_col,
                src_line as u32,
                src_col as u32,
                Some(source_name),
                None::<&str>,
                false,
            );
            inserted = true;
            seen.insert((generated_line, generated_col));
        }

        let Some(source) = token.get_source() else {
            continue;
        };
        if !seen.insert((token.get_dst_line(), token.get_dst_col())) {
            continue;
        }
        builder.add(
            token.get_dst_line(),
            token.get_dst_col(),
            token.get_src_line(),
            token.get_src_col(),
            Some(source),
            token.get_name(),
            false,
        );
    }

    if !inserted {
        builder.add(
            generated_line,
            generated_col,
            src_line as u32,
            src_col as u32,
            Some(source_name),
            None::<&str>,
            false,
        );
    }

    Some(Arc::new(builder.into_sourcemap()))
}

pub(crate) fn compose_source_maps(
    upper: &SourceMap,
    lower: &SourceMap,
) -> Result<SharedSourceMap, MappedTextError> {
    let mut builder = SourceMapBuilder::new(None);
    let mut saw_mapping = false;
    let indexed_lower = index_source_map(lower);

    for token in upper.tokens() {
        let composed = project_generated_position_to_original(
            &indexed_lower,
            token.get_src_line(),
            token.get_src_col(),
        )
        .ok_or(MappedTextError::SourceMapCompositionFailed)?;
        builder.add(
            token.get_dst_line(),
            token.get_dst_col(),
            composed.src_line,
            composed.src_col,
            Some(composed.source.as_str()),
            token.get_name().or(composed.name.as_deref()),
            false,
        );
        saw_mapping = true;
    }

    if !saw_mapping {
        return Err(MappedTextError::SourceMapCompositionFailed);
    }

    Ok(Arc::new(builder.into_sourcemap()))
}

pub(crate) fn project_original_anchors_to_generated(
    map: &SourceMap,
    anchors: &[(u32, u32)],
) -> Vec<(u32, u32, u32, u32, Option<String>)> {
    let mut by_original = std::collections::BTreeMap::new();

    for token in map.tokens() {
        let key = (token.get_src_line(), token.get_src_col());
        by_original.entry(key).or_insert_with(|| {
            (
                token.get_dst_line(),
                token.get_dst_col(),
                token.get_src_line(),
                token.get_src_col(),
                token.get_source().map(str::to_string),
            )
        });
    }

    anchors
        .iter()
        .filter_map(|anchor| by_original.get(anchor).cloned())
        .collect()
}

#[derive(Debug, Clone)]
pub(crate) struct IndexedSourceMap {
    tokens: Vec<IndexedToken>,
}

#[derive(Debug, Clone)]
struct IndexedToken {
    dst_line: u32,
    dst_col: u32,
    src_line: u32,
    src_col: u32,
    source: String,
    name: Option<String>,
}

pub(crate) fn index_source_map(map: &SourceMap) -> IndexedSourceMap {
    IndexedSourceMap {
        tokens: map
            .tokens()
            .filter_map(|token| {
                Some(IndexedToken {
                    dst_line: token.get_dst_line(),
                    dst_col: token.get_dst_col(),
                    src_line: token.get_src_line(),
                    src_col: token.get_src_col(),
                    source: token.get_source()?.to_string(),
                    name: token.get_name().map(str::to_string),
                })
            })
            .collect(),
    }
}

pub(crate) fn extract_local_submap_indexed(
    map: &IndexedSourceMap,
    source_index: &Utf16Index<'_>,
    start_byte: usize,
    end_byte: usize,
) -> Option<SharedSourceMap> {
    let start = source_index.byte_to_line_utf16_col(start_byte);
    let end = source_index.byte_to_line_utf16_col(end_byte);
    let start_line = start.0 as u32;
    let start_col = start.1 as u32;
    let end_line = end.0 as u32;
    let end_col = end.1 as u32;
    let start_index = lower_bound(&map.tokens, start_line, start_col);
    let end_index = lower_bound(&map.tokens, end_line, end_col);
    let mut builder = SourceMapBuilder::new(None);

    if start_index >= end_index {
        return None;
    }

    for token in &map.tokens[start_index..end_index] {
        let generated_line = token.dst_line.saturating_sub(start_line);
        let generated_col = if token.dst_line == start_line {
            token.dst_col.saturating_sub(start_col)
        } else {
            token.dst_col
        };

        builder.add(
            generated_line,
            generated_col,
            token.src_line,
            token.src_col,
            Some(token.source.as_str()),
            token.name.as_deref(),
            false,
        );
    }

    Some(Arc::new(builder.into_sourcemap()))
}

pub(crate) fn extract_generated_submap(
    map: &SourceMap,
    generated_text: &str,
    start_byte: usize,
    end_byte: usize,
) -> Option<SharedSourceMap> {
    if start_byte >= end_byte || end_byte > generated_text.len() {
        return None;
    }

    let indexed = index_source_map(map);
    let line_starts = compute_line_starts(generated_text);
    let generated_index = Utf16Index::new(generated_text, &line_starts);
    let start = generated_index.byte_to_line_utf16_col(start_byte);
    let end = generated_index.byte_to_line_utf16_col(end_byte);
    let start_line = start.0 as u32;
    let start_col = start.1 as u32;
    let end_line = end.0 as u32;
    let end_col = end.1 as u32;
    let start_index = lower_bound(&indexed.tokens, start_line, start_col);
    let end_index = lower_bound(&indexed.tokens, end_line, end_col);
    let mut builder = SourceMapBuilder::new(None);
    let mut saw_mapping = false;

    if let Some(projected_start) =
        project_generated_position_to_original(&indexed, start_line, start_col)
    {
        builder.add(
            0,
            0,
            projected_start.src_line,
            projected_start.src_col,
            Some(projected_start.source.as_str()),
            projected_start.name.as_deref(),
            false,
        );
        saw_mapping = true;
    }

    for token in &indexed.tokens[start_index..end_index] {
        let generated_line = token.dst_line.saturating_sub(start_line);
        let generated_col = if token.dst_line == start_line {
            token.dst_col.saturating_sub(start_col)
        } else {
            token.dst_col
        };

        builder.add(
            generated_line,
            generated_col,
            token.src_line,
            token.src_col,
            Some(token.source.as_str()),
            token.name.as_deref(),
            false,
        );
        saw_mapping = true;
    }

    if let Some(projected_end) = project_generated_position_to_original(&indexed, end_line, end_col)
    {
        let end_generated_line = end_line.saturating_sub(start_line);
        let end_generated_col = if end_line == start_line {
            end_col.saturating_sub(start_col)
        } else {
            end_col
        };
        builder.add(
            end_generated_line,
            end_generated_col,
            projected_end.src_line,
            projected_end.src_col,
            Some(projected_end.source.as_str()),
            projected_end.name.as_deref(),
            false,
        );
        saw_mapping = true;
    }

    saw_mapping.then(|| Arc::new(builder.into_sourcemap()))
}

fn lower_bound(tokens: &[IndexedToken], line: u32, col: u32) -> usize {
    let mut low = 0usize;
    let mut high = tokens.len();
    while low < high {
        let mid = (low + high) / 2;
        if (tokens[mid].dst_line, tokens[mid].dst_col) < (line, col) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    low
}

pub(crate) fn project_generated_position_to_original(
    map: &IndexedSourceMap,
    line: u32,
    col: u32,
) -> Option<IndexedProjection> {
    let insertion = lower_bound(&map.tokens, line, col);
    let current_index = if insertion < map.tokens.len()
        && (
            map.tokens[insertion].dst_line,
            map.tokens[insertion].dst_col,
        ) == (line, col)
    {
        insertion
    } else {
        insertion.checked_sub(1)?
    };
    let current = &map.tokens[current_index];

    if (current.dst_line, current.dst_col) == (line, col) {
        return Some(IndexedProjection::from_token(current));
    }

    let next = map.tokens.get(current_index + 1);
    if let Some(next) = next
        && current.dst_line == line
        && next.dst_line == line
        && current.src_line == next.src_line
        && col < next.dst_col
    {
        let generated_delta = col.saturating_sub(current.dst_col);
        return Some(IndexedProjection {
            src_line: current.src_line,
            src_col: current.src_col + generated_delta,
            source: current.source.clone(),
            name: current.name.clone(),
        });
    }

    Some(IndexedProjection::from_token(current))
}

#[derive(Debug, Clone)]
pub(crate) struct IndexedProjection {
    pub(crate) src_line: u32,
    pub(crate) src_col: u32,
    pub(crate) source: String,
    pub(crate) name: Option<String>,
}

impl IndexedProjection {
    fn from_token(token: &IndexedToken) -> Self {
        Self {
            src_line: token.src_line,
            src_col: token.src_col,
            source: token.source.clone(),
            name: token.name.clone(),
        }
    }
}

pub(crate) fn compute_line_starts(source: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (index, byte) in source.bytes().enumerate() {
        if byte == b'\n' {
            starts.push(index + 1);
        }
    }
    starts
}
