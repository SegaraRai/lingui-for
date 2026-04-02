use sourcemap::{SourceMap, SourceMapBuilder};

use crate::common::{IndexedText, Span};

use super::primitives::{
    IndexedSourceMap, IndexedToken, extract_generated_submap,
    project_generated_position_to_original,
};

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum MappedSegment {
    Unmapped(String),
    PreMapped {
        code: String,
        indexed_source_map: Box<IndexedSourceMap>,
    },
}

#[derive(Debug, Clone)]
pub(crate) struct MappedText<'a> {
    source_name: &'a str,
    source_text: &'a str,
    segments: Vec<MappedSegment>,
}

#[derive(thiserror::Error, Debug)]
pub enum MappedTextError {
    #[error("failed to compose source maps")]
    SourceMapCompositionFailed,
    #[error("span out of bounds")]
    OutOfBounds,
    #[error("mapped texts must share the same source context")]
    MismatchedSourceContext,
    #[error("failed to slice mapped segment")]
    InvalidSegmentSlice,
    #[error(
        "invalid replacement: start={start}, end={end}, cursor={cursor}, source_len={source_len}"
    )]
    InvalidReplacement {
        start: usize,
        end: usize,
        cursor: usize,
        source_len: usize,
    },
}

impl<'a> MappedText<'a> {
    pub(crate) fn new(source_name: &'a str, source_text: &'a str) -> Self {
        Self {
            source_name,
            source_text,
            segments: Vec::new(),
        }
    }

    pub(crate) fn push_unmapped(&mut self, text: impl Into<String>) {
        let text = text.into();
        if !text.is_empty() {
            self.segments.push(MappedSegment::Unmapped(text));
        }
    }

    pub(crate) fn push_pre_mapped(
        &mut self,
        code: impl Into<String>,
        indexed_source_map: IndexedSourceMap,
    ) {
        let code = code.into();
        if !code.is_empty() {
            self.segments.push(MappedSegment::PreMapped {
                code,
                indexed_source_map: Box::new(indexed_source_map),
            });
        }
    }

    pub(crate) fn from_rendered(
        source_name: &'a str,
        source_text: &'a str,
        code: impl Into<String>,
        source_map: Option<&IndexedSourceMap>,
    ) -> Self {
        let mut mapped = Self::new(source_name, source_text);
        let code = code.into();
        match source_map {
            Some(map) if !code.is_empty() => {
                append_rendered_segments(&mut mapped, &code, map);
            }
            _ => mapped.push_unmapped(code),
        }
        mapped
    }

    pub(crate) fn len(&self) -> usize {
        self.segments.iter().map(MappedSegment::len).sum()
    }

    pub(crate) fn source_name(&self) -> &'a str {
        self.source_name
    }

    pub(crate) fn empty_like(&self) -> Self {
        Self::new(self.source_name, self.source_text)
    }

    pub(crate) fn slice(&self, span: Span) -> Result<Self, MappedTextError> {
        if span.start > span.end || span.end > self.len() {
            return Err(MappedTextError::OutOfBounds);
        }

        let mut out = Self::new(self.source_name, self.source_text);
        let mut cursor = 0usize;
        for segment in &self.segments {
            let segment_end = cursor + segment.len();
            if segment_end <= span.start {
                cursor = segment_end;
                continue;
            }
            if cursor >= span.end {
                break;
            }

            let local_start = span.start.saturating_sub(cursor);
            let local_end = (span.end.min(segment_end)) - cursor;
            if let Some(sliced) = slice_segment(segment, local_start, local_end)? {
                out.segments.push(sliced);
            }
            cursor = segment_end;
        }

        Ok(out)
    }

    pub(crate) fn append(&mut self, other: Self) -> Result<(), MappedTextError> {
        self.ensure_compatible(&other)?;
        self.segments.extend(other.segments);
        Ok(())
    }

    pub(crate) fn append_slice_from(
        &mut self,
        other: &Self,
        span: Span,
    ) -> Result<(), MappedTextError> {
        self.ensure_compatible(other)?;
        self.append(other.slice(span)?)
    }

    pub(crate) fn into_rendered(self) -> Result<RenderedMappedText, MappedTextError> {
        render_mapped_text(self.source_name, self.source_text, &self.segments)
    }

    fn ensure_compatible(&self, other: &Self) -> Result<(), MappedTextError> {
        if self.source_name == other.source_name && self.source_text == other.source_text {
            Ok(())
        } else {
            Err(MappedTextError::MismatchedSourceContext)
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RenderedMappedText {
    pub(crate) code: String,
    pub(crate) indexed_source_map: Option<IndexedSourceMap>,
}

pub(crate) fn render_mapped_text(
    source_name: &str,
    source_text: &str,
    segments: &[MappedSegment],
) -> Result<RenderedMappedText, MappedTextError> {
    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source_text));

    let mut code = String::new();
    let mut offset = GeneratedOffset::default();
    let mut saw_mapping = false;

    for segment in segments {
        match segment {
            MappedSegment::Unmapped(text) => {
                code.push_str(text);
                offset = advance_generated_offset(offset, text);
            }
            MappedSegment::PreMapped {
                code: text,
                indexed_source_map,
                ..
            } => {
                code.push_str(text);
                apply_shifted_map(&mut builder, indexed_source_map.source_map(), offset);
                saw_mapping = true;
                offset = advance_generated_offset(offset, text);
            }
        }
    }

    let indexed_source_map = if saw_mapping {
        Some(IndexedSourceMap::new(builder.into_sourcemap()))
    } else {
        None
    };

    Ok(RenderedMappedText {
        code,
        indexed_source_map,
    })
}

pub(crate) fn build_segmented_map(
    source_name: &str,
    source_text: &str,
    generated_text: &str,
    segments: &[crate::synthesis::NormalizedSegment],
    source_anchors: &[usize],
) -> Result<Option<IndexedSourceMap>, MappedTextError> {
    if segments.is_empty() {
        return Ok(None);
    }

    let source = IndexedText::new(source_text);
    let generated = IndexedText::new(generated_text);

    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source_text));
    let mut saw_mapping = false;

    for segment in segments {
        let segment_start = segment.original_start;
        let segment_end = segment.original_start + segment.len;
        let lower = source_anchors.partition_point(|anchor| *anchor < segment_start);
        let upper = source_anchors.partition_point(|anchor| *anchor < segment_end);

        add_segment_mapping_point(
            &mut builder,
            source_name,
            &source,
            &generated,
            segment,
            segment_start,
        )?;
        saw_mapping = true;

        for anchor in source_anchors[lower..upper].iter().copied() {
            if anchor == segment_start {
                continue;
            }
            add_segment_mapping_point(
                &mut builder,
                source_name,
                &source,
                &generated,
                segment,
                anchor,
            )?;
        }

        add_segment_mapping_point(
            &mut builder,
            source_name,
            &source,
            &generated,
            segment,
            segment_end,
        )?;
    }

    Ok(saw_mapping.then(|| IndexedSourceMap::new(builder.into_sourcemap())))
}

fn apply_shifted_map(builder: &mut SourceMapBuilder, map: &SourceMap, offset: GeneratedOffset) {
    for token in map.tokens() {
        let Some(source) = token.get_source() else {
            continue;
        };
        let generated_line = offset.line + token.get_dst_line();
        let generated_col = if token.get_dst_line() == 0 {
            offset.column + token.get_dst_col()
        } else {
            token.get_dst_col()
        };
        builder.add(
            generated_line,
            generated_col,
            token.get_src_line(),
            token.get_src_col(),
            Some(source),
            token.get_name(),
            false,
        );
    }
}

impl MappedSegment {
    fn len(&self) -> usize {
        match self {
            MappedSegment::Unmapped(text) => text.len(),
            MappedSegment::PreMapped { code, .. } => code.len(),
        }
    }
}

fn slice_segment(
    segment: &MappedSegment,
    start: usize,
    end: usize,
) -> Result<Option<MappedSegment>, MappedTextError> {
    if start >= end {
        return Ok(None);
    }

    match segment {
        MappedSegment::Unmapped(text) => {
            let sliced = text
                .get(start..end)
                .ok_or(MappedTextError::InvalidSegmentSlice)?;
            Ok(Some(MappedSegment::Unmapped(sliced.to_string())))
        }
        MappedSegment::PreMapped {
            code,
            indexed_source_map,
        } => {
            let sliced_code = code
                .get(start..end)
                .ok_or(MappedTextError::InvalidSegmentSlice)?;
            let indexed_code = IndexedText::new(code);
            let sliced_map =
                extract_generated_submap(indexed_source_map, &indexed_code, start, end)
                    .ok_or(MappedTextError::InvalidSegmentSlice)?;
            Ok(Some(MappedSegment::PreMapped {
                code: sliced_code.to_string(),
                indexed_source_map: Box::new(sliced_map),
            }))
        }
    }
}

fn add_segment_mapping_point(
    builder: &mut SourceMapBuilder,
    source_name: &str,
    source: &IndexedText<'_>,
    generated: &IndexedText<'_>,
    segment: &crate::synthesis::NormalizedSegment,
    original_byte: usize,
) -> Result<(), MappedTextError> {
    let clamped = original_byte.min(segment.original_start + segment.len);
    let generated_byte = segment.generated_start + clamped.saturating_sub(segment.original_start);
    let (original_line, original_col) = source
        .byte_to_line_utf16_col(clamped)
        .ok_or(MappedTextError::InvalidSegmentSlice)?;
    let (generated_line, generated_col) = generated
        .byte_to_line_utf16_col(generated_byte)
        .ok_or(MappedTextError::InvalidSegmentSlice)?;
    builder.add(
        generated_line as u32,
        generated_col as u32,
        original_line as u32,
        original_col as u32,
        Some(source_name),
        None::<&str>,
        false,
    );
    Ok(())
}

fn append_rendered_segments(
    mapped: &mut MappedText<'_>,
    code: &str,
    indexed_map: &IndexedSourceMap,
) {
    let generated = IndexedText::new(code);
    if indexed_map.tokens().is_empty() {
        mapped.push_unmapped(code);
        return;
    }

    let tokens = indexed_map.tokens();
    let Some(first) = tokens.first() else {
        mapped.push_unmapped(code);
        return;
    };
    let (first_line, first_col) = first.generated_position();
    let Ok(mut segment_start) = generated
        .line_utf16_col_to_byte(first_line as usize, first_col as usize)
        .ok_or(MappedTextError::InvalidSegmentSlice)
    else {
        mapped.push_unmapped(code);
        return;
    };

    if segment_start > 0 {
        mapped.push_unmapped(&code[..segment_start]);
    }

    let mut start_index = 0usize;
    while start_index < tokens.len() {
        let current = &tokens[start_index];
        let mut end_index = start_index + 1;
        while end_index < tokens.len()
            && tokens[end_index].generated_position() == current.generated_position()
        {
            end_index += 1;
        }

        let segment_end = if let Some(next) = tokens.get(end_index) {
            let (next_line, next_col) = next.generated_position();
            let Ok(boundary) = generated
                .line_utf16_col_to_byte(next_line as usize, next_col as usize)
                .ok_or(MappedTextError::InvalidSegmentSlice)
            else {
                mapped.push_unmapped(&code[segment_start..]);
                return;
            };
            boundary
        } else {
            code.len()
        };

        if segment_end > segment_start {
            if let Some(submap) = build_segment_submap(
                indexed_map,
                start_index,
                end_index,
                &generated,
                segment_start,
                segment_end,
            ) {
                mapped.segments.push(MappedSegment::PreMapped {
                    code: code[segment_start..segment_end].to_string(),
                    indexed_source_map: Box::new(submap),
                });
            } else {
                mapped.push_unmapped(&code[segment_start..segment_end]);
            }
        }

        segment_start = segment_end;
        start_index = end_index;
    }
}

fn build_segment_submap(
    indexed_map: &IndexedSourceMap,
    start_index: usize,
    end_index: usize,
    generated: &IndexedText<'_>,
    start_byte: usize,
    end_byte: usize,
) -> Option<IndexedSourceMap> {
    let start = generated.byte_to_line_utf16_col(start_byte)?;
    let end = generated.byte_to_line_utf16_col(end_byte)?;
    let start_line = start.0 as u32;
    let start_col = start.1 as u32;
    let end_line = end.0 as u32;
    let end_col = end.1 as u32;

    let mut tokens = Vec::with_capacity(end_index.saturating_sub(start_index) + 2);
    if let Some(projected_start) =
        project_generated_position_to_original(indexed_map, start_line, start_col)
    {
        tokens.push(IndexedToken::from_projection(0, 0, projected_start));
    }

    for token in &indexed_map.tokens()[start_index..end_index] {
        let shifted = token.shifted_generated(start_line, start_col);
        if tokens
            .last()
            .map(|last| last.generated_position() != shifted.generated_position())
            .unwrap_or(true)
        {
            tokens.push(shifted);
        }
    }

    if let Some(projected_end) =
        project_generated_position_to_original(indexed_map, end_line, end_col)
    {
        let shifted_end = IndexedToken::from_projection(
            end_line.saturating_sub(start_line),
            if end_line == start_line {
                end_col.saturating_sub(start_col)
            } else {
                end_col
            },
            projected_end,
        );
        if tokens
            .last()
            .map(|last| last.generated_position() != shifted_end.generated_position())
            .unwrap_or(true)
        {
            tokens.push(shifted_end);
        }
    }

    indexed_map.submap_from_generated_tokens(tokens)
}

#[derive(Debug, Clone, Copy, Default)]
struct GeneratedOffset {
    line: u32,
    column: u32,
}

fn advance_generated_offset(mut offset: GeneratedOffset, text: &str) -> GeneratedOffset {
    for line in text.split_inclusive('\n') {
        if line.ends_with('\n') {
            offset.line += 1;
            offset.column = 0;
        } else {
            offset.column += line.encode_utf16().count() as u32;
        }
    }
    offset
}

#[cfg(test)]
mod tests {
    use sourcemap::SourceMapBuilder;

    use crate::common::{IndexedSourceMap, Span};

    use super::MappedText;

    fn identity_submap(
        source_name: &str,
        source_text: &str,
        start: usize,
        end: usize,
    ) -> IndexedSourceMap {
        let code = &source_text[start..end];
        let mut builder = SourceMapBuilder::new(Some(source_name));
        builder.set_file(Some(source_name));
        let src_id = builder.add_source(source_name);
        builder.set_source_contents(src_id, Some(source_text));
        builder.add(
            0,
            0,
            0,
            start as u32,
            Some(source_name),
            None::<&str>,
            false,
        );
        builder.add(
            0,
            code.encode_utf16().count() as u32,
            0,
            end as u32,
            Some(source_name),
            None::<&str>,
            false,
        );
        IndexedSourceMap::new(builder.into_sourcemap())
    }

    #[test]
    fn slices_pre_mapped_segments() {
        let source = "abcdef";
        let mut mapped = MappedText::new("test.ts", source);
        mapped.push_pre_mapped("cde", identity_submap("test.ts", source, 2, 5));

        let sliced = mapped.slice(Span::new(1, 3)).expect("slice succeeds");
        let rendered = sliced.into_rendered().expect("render succeeds");

        assert_eq!(rendered.code, "de");
        let token = rendered
            .indexed_source_map
            .as_ref()
            .and_then(|map| map.source_map().lookup_token(0, 0))
            .expect("lookup token");
        assert_eq!(token.get_src_col(), 3);
    }

    #[test]
    fn replaces_segments() {
        let source = "abcdef";
        let mut mapped = MappedText::new("test.ts", source);
        mapped.push_unmapped("ab");
        mapped.push_pre_mapped("cd", identity_submap("test.ts", source, 2, 4));
        mapped.push_unmapped("ef");

        let replacement = MappedText::from_rendered("test.ts", source, "YZ", None);
        let prefix = mapped
            .slice(Span::new(0, 2))
            .expect("prefix slice succeeds");
        let suffix = mapped
            .slice(Span::new(4, mapped.len()))
            .expect("suffix slice succeeds");
        let mut combined = MappedText::new("test.ts", source);
        combined.append(prefix).expect("append prefix succeeds");
        combined
            .append(replacement)
            .expect("append replacement succeeds");
        combined.append(suffix).expect("append suffix succeeds");

        assert_eq!(combined.into_rendered().expect("render").code, "abYZef");
    }
}
