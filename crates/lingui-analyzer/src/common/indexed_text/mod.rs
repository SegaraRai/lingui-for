use std::ops::Range;

use lean_string::LeanString;

use super::Span;

mod utf16;

use utf16::Utf16Table;

#[derive(Debug, Clone)]
pub struct IndexedText<'a> {
    text: &'a LeanString,
    utf16: Utf16Table<'a>,
}

#[derive(Debug, Clone)]
pub struct IndexedTextSlice<'a> {
    indexed: &'a IndexedText<'a>,
    range: Range<usize>,
}

impl<'a> IndexedText<'a> {
    pub fn new(text: &'a LeanString) -> Self {
        let line_starts = compute_line_starts(text);
        let utf16 = Utf16Table::new(text, &line_starts);
        Self { text, utf16 }
    }

    pub fn text(&self) -> &'a LeanString {
        self.text
    }

    pub fn len(&self) -> usize {
        self.text.len()
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub fn byte_to_line_utf16_col(&self, byte: usize) -> Option<(usize, usize)> {
        self.utf16.byte_to_line_utf16_col(byte)
    }

    pub fn line_utf16_col_to_byte(&self, line: usize, utf16_col: usize) -> Option<usize> {
        self.utf16.line_utf16_col_to_byte(line, utf16_col)
    }

    pub fn slice(&'a self, span: Span) -> Option<IndexedTextSlice<'a>> {
        IndexedTextSlice::new(self, span)
    }
}

impl<'a> IndexedTextSlice<'a> {
    pub fn new(indexed: &'a IndexedText<'a>, span: Span) -> Option<Self> {
        (span.start <= span.end
            && span.end <= indexed.len()
            && indexed.text().is_char_boundary(span.start)
            && indexed.text().is_char_boundary(span.end))
        .then_some(Self {
            indexed,
            range: span.start..span.end,
        })
    }

    pub fn as_str(&self) -> &'a str {
        &self.indexed.text()[self.range.clone()]
    }

    pub fn range(&self) -> Range<usize> {
        self.range.clone()
    }

    pub fn len(&self) -> usize {
        self.range.end.saturating_sub(self.range.start)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn local_to_global(&self, local_byte: usize) -> Option<usize> {
        (local_byte <= self.len()).then_some(self.range.start + local_byte)
    }

    pub fn global_to_local(&self, global_byte: usize) -> Option<usize> {
        (self.range.start..=self.range.end)
            .contains(&global_byte)
            .then(|| global_byte - self.range.start)
    }

    pub fn byte_to_global_line_utf16_col(&self, local_byte: usize) -> Option<(usize, usize)> {
        self.local_to_global(local_byte)
            .and_then(|global_byte| self.indexed.byte_to_line_utf16_col(global_byte))
    }

    pub fn byte_to_line_utf16_col(&self, local_byte: usize) -> Option<(usize, usize)> {
        self.indexed
            .utf16
            .relative_byte_to_line_utf16_col(self.range.clone(), local_byte)
    }
}

fn compute_line_starts(source: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (index, byte) in source.bytes().enumerate() {
        if byte == b'\n' {
            starts.push(index + 1);
        }
    }
    starts
}

#[cfg(test)]
mod tests {
    use lean_string::LeanString;

    use crate::common::Span;

    use super::IndexedText;

    #[test]
    fn slice_reports_relative_line_and_utf16_columns() {
        let source_text = LeanString::from("ab😀\nxyz\n");
        let source = IndexedText::new(&source_text);
        let slice = source
            .slice(Span::new(1, "ab😀\nxy".len()))
            .expect("valid slice");

        assert_eq!(slice.byte_to_line_utf16_col(0), Some((0, 0)));
        assert_eq!(slice.byte_to_line_utf16_col("b😀".len()), Some((0, 3)));
        assert_eq!(slice.byte_to_line_utf16_col("b😀\n".len()), Some((1, 0)));
        assert_eq!(slice.byte_to_line_utf16_col("b😀\nx".len()), Some((1, 1)));
        assert_eq!(slice.byte_to_line_utf16_col(99), None);
    }

    #[test]
    fn rejects_out_of_range_slices() {
        let source_text = LeanString::from("abc");
        let source = IndexedText::new(&source_text);

        assert!(source.slice(Span::new(1, 4)).is_none());
    }

    #[test]
    fn rejects_non_char_boundary_slices() {
        let source_text = LeanString::from("a😀b");
        let source = IndexedText::new(&source_text);

        assert!(source.slice(Span::new(1, 2)).is_none());
        assert!(source.slice(Span::new(0, 2)).is_none());
    }
}
