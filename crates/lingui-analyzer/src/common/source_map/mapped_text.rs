use crate::common::Utf16Index;

use sourcemap::{SourceMap, SourceMapBuilder};

use super::SharedSourceMap;
use super::primitives::{compute_line_starts, extract_generated_submap};

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum MappedSegment {
    Unmapped(String),
    PreMapped {
        code: String,
        source_map: SharedSourceMap,
    },
}

#[derive(Debug, Clone)]
pub(crate) struct MappedText<'a> {
    source_name: &'a str,
    source_text: &'a str,
    segments: Vec<MappedSegment>,
}

#[derive(thiserror::Error, Debug)]
pub(crate) enum MappedTextError {
    #[error("failed to compose source maps")]
    SourceMapCompositionFailed,
    #[error("span out of bounds")]
    OutOfBounds,
    #[error("mapped texts must share the same source context")]
    MismatchedSourceContext,
    #[error("failed to slice mapped segment")]
    InvalidSegmentSlice,
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

    pub(crate) fn push_pre_mapped(&mut self, code: impl Into<String>, source_map: SharedSourceMap) {
        let code = code.into();
        if !code.is_empty() {
            self.segments
                .push(MappedSegment::PreMapped { code, source_map });
        }
    }

    pub(crate) fn from_rendered(
        source_name: &'a str,
        source_text: &'a str,
        code: impl Into<String>,
        source_map: Option<SharedSourceMap>,
    ) -> Self {
        let mut mapped = Self::new(source_name, source_text);
        let code = code.into();
        match source_map {
            Some(map) if !code.is_empty() => {
                append_rendered_segments(&mut mapped, &code, &map);
            }
            _ => mapped.push_unmapped(code),
        }
        mapped
    }

    pub(crate) fn len(&self) -> usize {
        self.segments.iter().map(MappedSegment::len).sum()
    }

    pub(crate) fn slice(&self, span: crate::common::Span) -> Result<Self, MappedTextError> {
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

    pub(crate) fn replace(
        &mut self,
        span: crate::common::Span,
        other: Self,
    ) -> Result<(), MappedTextError> {
        self.ensure_compatible(&other)?;
        let prefix = self.slice(crate::common::Span::new(0, span.start))?;
        let suffix = self.slice(crate::common::Span::new(span.end, self.len()))?;
        self.segments = prefix
            .segments
            .into_iter()
            .chain(other.segments)
            .chain(suffix.segments)
            .collect();
        Ok(())
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
    pub(crate) source_map: Option<SharedSourceMap>,
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
                source_map,
            } => {
                code.push_str(text);
                apply_shifted_map(&mut builder, source_map, offset);
                saw_mapping = true;
                offset = advance_generated_offset(offset, text);
            }
        }
    }

    let source_map = if saw_mapping {
        Some(builder.into_sourcemap().into())
    } else {
        None
    };

    Ok(RenderedMappedText { code, source_map })
}

pub(crate) fn build_segmented_map(
    source_name: &str,
    source_text: &str,
    generated_text: &str,
    segments: &[crate::synthesis::NormalizedSegment],
    source_anchors: &[usize],
) -> Result<Option<SharedSourceMap>, MappedTextError> {
    if segments.is_empty() {
        return Ok(None);
    }

    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source_text));
    let source_line_starts = compute_line_starts(source_text);
    let source_index = Utf16Index::new(source_text, &source_line_starts);
    let generated_line_starts = compute_line_starts(generated_text);
    let generated_index = Utf16Index::new(generated_text, &generated_line_starts);
    let mut saw_mapping = false;

    for segment in segments {
        let segment_start = segment.original_start;
        let segment_end = segment.original_start + segment.len;
        let lower = source_anchors.partition_point(|anchor| *anchor < segment_start);
        let upper = source_anchors.partition_point(|anchor| *anchor < segment_end);

        add_segment_mapping_point(
            &mut builder,
            source_name,
            &source_index,
            &generated_index,
            segment,
            segment_start,
        );
        saw_mapping = true;

        for anchor in source_anchors[lower..upper].iter().copied() {
            if anchor == segment_start {
                continue;
            }
            add_segment_mapping_point(
                &mut builder,
                source_name,
                &source_index,
                &generated_index,
                segment,
                anchor,
            );
        }

        add_segment_mapping_point(
            &mut builder,
            source_name,
            &source_index,
            &generated_index,
            segment,
            segment_end,
        );
    }

    Ok(saw_mapping.then(|| builder.into_sourcemap().into()))
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
            Ok(Some(MappedSegment::Unmapped(text[start..end].to_string())))
        }
        MappedSegment::PreMapped { code, source_map } => {
            let sliced_code = code[start..end].to_string();
            let sliced_map = extract_generated_submap(source_map, code, start, end)
                .ok_or(MappedTextError::InvalidSegmentSlice)?;
            Ok(Some(MappedSegment::PreMapped {
                code: sliced_code,
                source_map: sliced_map,
            }))
        }
    }
}

fn add_segment_mapping_point(
    builder: &mut SourceMapBuilder,
    source_name: &str,
    source_index: &Utf16Index<'_>,
    generated_index: &Utf16Index<'_>,
    segment: &crate::synthesis::NormalizedSegment,
    original_byte: usize,
) {
    let clamped = original_byte.min(segment.original_start + segment.len);
    let generated_byte = segment.generated_start + clamped.saturating_sub(segment.original_start);
    let (original_line, original_col) = source_index.byte_to_line_utf16_col(clamped);
    let (generated_line, generated_col) = generated_index.byte_to_line_utf16_col(generated_byte);
    builder.add(
        generated_line as u32,
        generated_col as u32,
        original_line as u32,
        original_col as u32,
        Some(source_name),
        None::<&str>,
        false,
    );
}

fn append_rendered_segments(mapped: &mut MappedText<'_>, code: &str, map: &SharedSourceMap) {
    let line_starts = compute_line_starts(code);
    let generated_index = Utf16Index::new(code, &line_starts);
    let mut boundaries = map
        .tokens()
        .map(|token| {
            generated_index
                .line_utf16_col_to_byte(token.get_dst_line() as usize, token.get_dst_col() as usize)
        })
        .filter(|offset| *offset <= code.len())
        .collect::<Vec<_>>();
    boundaries.sort_unstable();
    boundaries.dedup();

    if boundaries.is_empty() {
        mapped.push_unmapped(code);
        return;
    }

    let mut cursor = 0usize;
    for (index, start) in boundaries.iter().copied().enumerate() {
        if start > cursor {
            mapped.push_unmapped(&code[cursor..start]);
        }

        let end = boundaries.get(index + 1).copied().unwrap_or(code.len());
        if start >= end {
            cursor = end.max(cursor);
            continue;
        }

        if let Some(submap) = extract_generated_submap(map, code, start, end) {
            mapped.push_pre_mapped(&code[start..end], submap);
        } else {
            mapped.push_unmapped(&code[start..end]);
        }
        cursor = end;
    }

    if cursor < code.len() {
        mapped.push_unmapped(&code[cursor..]);
    }
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
    use std::sync::Arc;

    use sourcemap::SourceMapBuilder;

    use crate::common::Span;

    use super::MappedText;

    fn identity_submap(
        source_name: &str,
        source_text: &str,
        start: usize,
        end: usize,
    ) -> Arc<sourcemap::SourceMap> {
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
        Arc::new(builder.into_sourcemap())
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
            .source_map
            .as_ref()
            .and_then(|map| map.lookup_token(0, 0))
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
        mapped
            .replace(Span::new(2, 4), replacement)
            .expect("replace succeeds");
        assert_eq!(mapped.into_rendered().expect("render").code, "abYZef");
    }
}
