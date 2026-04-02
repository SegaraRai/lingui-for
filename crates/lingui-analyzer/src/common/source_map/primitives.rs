use std::collections::{BTreeMap, BTreeSet};
use std::io::Cursor;

use sourcemap::{SourceMap, SourceMapBuilder};

use crate::common::{IndexedText, MappedTextError};

pub(crate) fn parse_source_map(json: &str) -> Option<SourceMap> {
    SourceMap::from_slice(json.as_bytes()).ok()
}

pub(crate) fn source_map_to_json(map: &SourceMap) -> Option<String> {
    let mut out = Cursor::new(Vec::new());
    map.to_writer(&mut out).ok()?;
    String::from_utf8(out.into_inner()).ok()
}

pub(crate) fn overlay_source_map_with_single_anchor(
    base: &SourceMap,
    source_name: &str,
    source: &IndexedText<'_>,
    generated_line: u32,
    generated_col: u32,
    original_byte: usize,
) -> Option<SourceMap> {
    let mut builder = SourceMapBuilder::new(base.get_file());
    builder.set_file(base.get_file());
    builder.set_source_root(base.get_source_root());

    for src_id in 0..base.get_source_count() {
        let source = base.get_source(src_id)?;
        let builder_src_id = builder.add_source(source);
        builder.set_source_contents(builder_src_id, base.get_source_contents(src_id));
    }

    let (src_line, src_col) = source.byte_to_line_utf16_col(original_byte)?;

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

    Some(builder.into_sourcemap())
}

pub(crate) fn compose_source_maps(
    upper: &SourceMap,
    lower: &IndexedSourceMap,
) -> Result<IndexedSourceMap, MappedTextError> {
    let mut builder = SourceMapBuilder::new(None);
    let mut saw_mapping = false;

    for token in upper.tokens() {
        let composed = project_generated_position_to_original(
            lower,
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

    Ok(IndexedSourceMap::new(builder.into_sourcemap()))
}

pub(crate) fn project_original_anchors_to_generated(
    map: &IndexedSourceMap,
    anchors: &[(u32, u32)],
) -> Vec<OriginalAnchorProjection> {
    anchors
        .iter()
        .filter_map(|anchor| map.by_original.get(anchor).cloned())
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct IndexedSourceMap {
    source_map: SourceMap,
    tokens: Vec<IndexedToken>,
    by_original: BTreeMap<(u32, u32), OriginalAnchorProjection>,
    dst_positions: BTreeSet<(u32, u32)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IndexedToken {
    dst_line: u32,
    dst_col: u32,
    src_line: u32,
    src_col: u32,
    source: String,
    name: Option<String>,
}

impl IndexedToken {
    pub(crate) fn generated_position(&self) -> (u32, u32) {
        (self.dst_line, self.dst_col)
    }

    pub(crate) fn shifted_generated(&self, start_line: u32, start_col: u32) -> Self {
        Self {
            dst_line: self.dst_line.saturating_sub(start_line),
            dst_col: if self.dst_line == start_line {
                self.dst_col.saturating_sub(start_col)
            } else {
                self.dst_col
            },
            src_line: self.src_line,
            src_col: self.src_col,
            source: self.source.clone(),
            name: self.name.clone(),
        }
    }

    pub(crate) fn from_projection(
        dst_line: u32,
        dst_col: u32,
        projection: IndexedProjection,
    ) -> Self {
        Self {
            dst_line,
            dst_col,
            src_line: projection.src_line,
            src_col: projection.src_col,
            source: projection.source,
            name: projection.name,
        }
    }
}

impl IndexedSourceMap {
    pub(crate) fn new(source_map: SourceMap) -> Self {
        let tokens = collect_indexed_tokens(&source_map);
        Self::from_parts(source_map, tokens)
    }

    pub(crate) fn source_map(&self) -> &SourceMap {
        &self.source_map
    }

    pub(crate) fn tokens(&self) -> &[IndexedToken] {
        &self.tokens
    }

    pub(crate) fn has_dst_position(&self, line: u32, col: u32) -> bool {
        self.dst_positions.contains(&(line, col))
    }

    pub(crate) fn clone_with_inserted_projections(
        &self,
        extras: impl IntoIterator<Item = OriginalAnchorProjection>,
        fallback_source: &str,
    ) -> Self {
        let mut extras = extras
            .into_iter()
            .filter(|projection| !self.has_dst_position(projection.dst_line, projection.dst_col))
            .map(|projection| IndexedToken {
                dst_line: projection.dst_line,
                dst_col: projection.dst_col,
                src_line: projection.src_line,
                src_col: projection.src_col,
                source: projection
                    .source
                    .unwrap_or_else(|| fallback_source.to_string()),
                name: None,
            })
            .collect::<Vec<_>>();
        extras.sort_by_key(|token| (token.dst_line, token.dst_col));

        let mut merged = Vec::with_capacity(self.tokens.len() + extras.len());
        let mut extra_index = 0usize;
        for token in &self.tokens {
            while let Some(extra) = extras.get(extra_index) {
                if (extra.dst_line, extra.dst_col) < (token.dst_line, token.dst_col) {
                    merged.push(extra.clone());
                    extra_index += 1;
                } else {
                    break;
                }
            }
            merged.push(token.clone());
        }
        merged.extend(extras.into_iter().skip(extra_index));

        Self::from_template_tokens(&self.source_map, merged)
    }

    fn from_parts(source_map: SourceMap, tokens: Vec<IndexedToken>) -> Self {
        let by_original = build_by_original(&tokens);
        let dst_positions = build_dst_positions(&tokens);

        Self {
            source_map,
            tokens,
            by_original,
            dst_positions,
        }
    }

    fn from_template_tokens(template: &SourceMap, tokens: Vec<IndexedToken>) -> Self {
        let source_map = build_source_map_from_indexed_tokens(template, &tokens);
        Self::from_parts(source_map, tokens)
    }

    pub(crate) fn submap_from_generated_tokens(&self, tokens: Vec<IndexedToken>) -> Option<Self> {
        (!tokens.is_empty()).then(|| Self::from_template_tokens(&self.source_map, tokens))
    }
}

fn collect_indexed_tokens(source_map: &SourceMap) -> Vec<IndexedToken> {
    source_map
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
        .collect()
}

fn build_by_original(tokens: &[IndexedToken]) -> BTreeMap<(u32, u32), OriginalAnchorProjection> {
    tokens
        .iter()
        .fold(BTreeMap::new(), |mut by_original, token| {
            by_original
                .entry((token.src_line, token.src_col))
                .or_insert_with(|| OriginalAnchorProjection {
                    dst_line: token.dst_line,
                    dst_col: token.dst_col,
                    src_line: token.src_line,
                    src_col: token.src_col,
                    source: Some(token.source.clone()),
                });
            by_original
        })
}

fn build_dst_positions(tokens: &[IndexedToken]) -> BTreeSet<(u32, u32)> {
    tokens
        .iter()
        .map(|token| (token.dst_line, token.dst_col))
        .collect()
}

fn build_source_map_from_indexed_tokens(
    template: &SourceMap,
    tokens: &[IndexedToken],
) -> SourceMap {
    let mut builder = SourceMapBuilder::new(template.get_file());
    builder.set_file(template.get_file());
    builder.set_source_root(template.get_source_root());

    for src_id in 0..template.get_source_count() {
        let Some(source) = template.get_source(src_id) else {
            continue;
        };
        let builder_src_id = builder.add_source(source);
        builder.set_source_contents(builder_src_id, template.get_source_contents(src_id));
    }

    for token in tokens {
        builder.add(
            token.dst_line,
            token.dst_col,
            token.src_line,
            token.src_col,
            Some(token.source.as_str()),
            token.name.as_deref(),
            false,
        );
    }

    builder.into_sourcemap()
}

pub(crate) fn extract_local_submap(
    map: &IndexedSourceMap,
    source: &IndexedText<'_>,
    start_byte: usize,
    end_byte: usize,
) -> Option<IndexedSourceMap> {
    let start = source.byte_to_line_utf16_col(start_byte)?;
    let end = source.byte_to_line_utf16_col(end_byte)?;
    let start_line = start.0 as u32;
    let start_col = start.1 as u32;
    let end_line = end.0 as u32;
    let end_col = end.1 as u32;
    let start_index = lower_bound(&map.tokens, start_line, start_col);
    let end_index = lower_bound(&map.tokens, end_line, end_col);
    let mut builder = SourceMapBuilder::new(None);
    let mut saw_mapping = false;

    if let Some(projected_start) =
        project_generated_position_to_original(map, start_line, start_col)
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
        saw_mapping = true;
    }

    saw_mapping.then(|| IndexedSourceMap::new(builder.into_sourcemap()))
}

pub(crate) fn extract_generated_submap(
    map: &IndexedSourceMap,
    generated: &IndexedText<'_>,
    start_byte: usize,
    end_byte: usize,
) -> Option<IndexedSourceMap> {
    if start_byte >= end_byte || end_byte > generated.len() {
        return None;
    }

    let start = generated.byte_to_line_utf16_col(start_byte)?;
    let end = generated.byte_to_line_utf16_col(end_byte)?;
    let start_line = start.0 as u32;
    let start_col = start.1 as u32;
    let end_line = end.0 as u32;
    let end_col = end.1 as u32;
    let start_index = lower_bound(&map.tokens, start_line, start_col);
    let end_index = lower_bound(&map.tokens, end_line, end_col);
    let mut tokens = Vec::with_capacity(end_index.saturating_sub(start_index) + 2);

    if let Some(projected_start) =
        project_generated_position_to_original(map, start_line, start_col)
    {
        tokens.push(IndexedToken {
            dst_line: 0,
            dst_col: 0,
            src_line: projected_start.src_line,
            src_col: projected_start.src_col,
            source: projected_start.source,
            name: projected_start.name,
        });
    }

    for token in &map.tokens[start_index..end_index] {
        let generated_line = token.dst_line.saturating_sub(start_line);
        let generated_col = if token.dst_line == start_line {
            token.dst_col.saturating_sub(start_col)
        } else {
            token.dst_col
        };

        let mapped = IndexedToken {
            dst_line: generated_line,
            dst_col: generated_col,
            src_line: token.src_line,
            src_col: token.src_col,
            source: token.source.clone(),
            name: token.name.clone(),
        };
        if tokens
            .last()
            .map(|last| (last.dst_line, last.dst_col) != (mapped.dst_line, mapped.dst_col))
            .unwrap_or(true)
        {
            tokens.push(mapped);
        }
    }

    if let Some(projected_end) = project_generated_position_to_original(map, end_line, end_col) {
        let mapped = IndexedToken {
            dst_line: end_line.saturating_sub(start_line),
            dst_col: if end_line == start_line {
                end_col.saturating_sub(start_col)
            } else {
                end_col
            },
            src_line: projected_end.src_line,
            src_col: projected_end.src_col,
            source: projected_end.source,
            name: projected_end.name,
        };
        if tokens
            .last()
            .map(|last| (last.dst_line, last.dst_col) != (mapped.dst_line, mapped.dst_col))
            .unwrap_or(true)
        {
            tokens.push(mapped);
        }
    }

    (!tokens.is_empty()).then(|| IndexedSourceMap::from_template_tokens(map.source_map(), tokens))
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OriginalAnchorProjection {
    pub(crate) dst_line: u32,
    pub(crate) dst_col: u32,
    pub(crate) src_line: u32,
    pub(crate) src_col: u32,
    pub(crate) source: Option<String>,
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
