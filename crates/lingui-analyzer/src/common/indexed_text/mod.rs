mod utf16;

use std::ops::Range;

pub use utf16::Utf16Index;

#[derive(Debug, Clone)]
pub struct IndexedText<'a> {
    text: &'a str,
    line_starts: Vec<usize>,
    utf16: Utf16Table,
}

#[derive(Debug, Clone)]
pub struct IndexedTextSlice<'a> {
    indexed: &'a IndexedText<'a>,
    range: Range<usize>,
}

impl<'a> IndexedText<'a> {
    pub fn new(text: &'a str) -> Self {
        let line_starts = compute_line_starts(text);
        let utf16 = Utf16Table::new(text, &line_starts);
        Self {
            text,
            line_starts,
            utf16,
        }
    }

    pub fn as_str(&self) -> &'a str {
        self.text
    }

    pub fn len(&self) -> usize {
        self.text.len()
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub fn line_starts(&self) -> &[usize] {
        &self.line_starts
    }

    pub fn byte_to_line_utf16_col(&self, byte: usize) -> (usize, usize) {
        self.utf16.byte_to_line_utf16_col(self.as_str(), byte)
    }

    pub fn line_utf16_col_to_byte(&self, line: usize, utf16_col: usize) -> usize {
        self.utf16
            .line_utf16_col_to_byte(self.as_str(), line, utf16_col)
    }

    pub fn slice(&'a self, range: Range<usize>) -> IndexedTextSlice<'a> {
        IndexedTextSlice {
            indexed: self,
            range,
        }
    }
}

impl<'a> IndexedTextSlice<'a> {
    pub fn as_str(&self) -> &'a str {
        &self.indexed.as_str()[self.range.clone()]
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

    pub fn local_to_global(&self, local_byte: usize) -> usize {
        (self.range.start + local_byte).min(self.range.end)
    }

    pub fn global_to_local(&self, global_byte: usize) -> Option<usize> {
        (self.range.start..=self.range.end)
            .contains(&global_byte)
            .then(|| global_byte - self.range.start)
    }

    pub fn byte_to_global_line_utf16_col(&self, local_byte: usize) -> (usize, usize) {
        self.indexed
            .byte_to_line_utf16_col(self.local_to_global(local_byte))
    }

    pub fn byte_to_line_utf16_col(&self, local_byte: usize) -> (usize, usize) {
        let global_byte = self.local_to_global(local_byte);
        let slice_start_line = line_for_byte(
            self.indexed.as_str(),
            &self.indexed.utf16.lines,
            self.range.start,
        );
        let line = line_for_byte(
            self.indexed.as_str(),
            &self.indexed.utf16.lines,
            global_byte,
        );
        let line_start = if line == slice_start_line {
            self.range.start
        } else {
            self.indexed.line_starts[line]
        };
        let utf16_col = self
            .indexed
            .byte_to_line_utf16_col(global_byte)
            .1
            .saturating_sub(self.indexed.byte_to_line_utf16_col(line_start).1);

        (line.saturating_sub(slice_start_line), utf16_col)
    }
}

#[derive(Debug, Clone)]
struct Utf16Table {
    lines: Vec<Utf16LineTable>,
}

impl Utf16Table {
    fn new(source: &str, line_starts: &[usize]) -> Self {
        let mut lines = Vec::with_capacity(line_starts.len());
        for (index, &start) in line_starts.iter().enumerate() {
            let mut end = match line_starts.get(index + 1).copied() {
                Some(next) => next.saturating_sub(1),
                None => source.len(),
            };
            if end > start && source.as_bytes().get(end - 1) == Some(&b'\r') {
                end = end.saturating_sub(1);
            }
            lines.push(Utf16LineTable::new(source, start, end));
        }
        Self { lines }
    }

    fn byte_to_line_utf16_col(&self, source: &str, byte: usize) -> (usize, usize) {
        let line = line_for_byte(source, &self.lines, byte);
        let col = self.lines[line].byte_to_utf16_col(source, byte);
        (line, col)
    }

    fn line_utf16_col_to_byte(&self, source: &str, line: usize, utf16_col: usize) -> usize {
        let Some(line_index) = self.lines.get(line) else {
            return source.len();
        };
        line_index.utf16_col_to_byte(source, utf16_col)
    }
}

#[derive(Debug, Clone)]
struct Utf16LineTable {
    start: usize,
    end: usize,
    checkpoints: Vec<Utf16Checkpoint>,
}

impl Utf16LineTable {
    const CHECKPOINT_STRIDE_CHARS: usize = 64;

    fn new(source: &str, start: usize, end: usize) -> Self {
        let mut checkpoints = vec![Utf16Checkpoint {
            byte: start,
            utf16_col: 0,
        }];

        let mut utf16_col = 0usize;
        let mut char_count = 0usize;

        for (rel, ch) in source[start..end].char_indices() {
            utf16_col += ch.len_utf16();
            char_count += 1;
            if char_count.is_multiple_of(Self::CHECKPOINT_STRIDE_CHARS) {
                checkpoints.push(Utf16Checkpoint {
                    byte: start + rel + ch.len_utf8(),
                    utf16_col,
                });
            }
        }

        if checkpoints
            .last()
            .map(|checkpoint| checkpoint.byte)
            .unwrap_or(start)
            != end
        {
            checkpoints.push(Utf16Checkpoint {
                byte: end,
                utf16_col,
            });
        }

        Self {
            start,
            end,
            checkpoints,
        }
    }

    fn byte_to_utf16_col(&self, source: &str, abs_byte: usize) -> usize {
        if abs_byte <= self.start {
            return 0;
        }
        let clamped = abs_byte.min(self.end);

        let checkpoint_index = match self
            .checkpoints
            .binary_search_by(|checkpoint| checkpoint.byte.cmp(&clamped))
        {
            Ok(index) => index,
            Err(0) => 0,
            Err(index) => index - 1,
        };
        let checkpoint = self.checkpoints[checkpoint_index];

        let mut cur_byte = checkpoint.byte;
        let mut cur_utf16 = checkpoint.utf16_col;
        let line = &source[self.start..self.end];

        while cur_byte < clamped {
            let rel = cur_byte - self.start;
            let Some(ch) = line[rel..].chars().next() else {
                break;
            };
            let next_byte = cur_byte + ch.len_utf8();
            if next_byte <= clamped {
                cur_utf16 += ch.len_utf16();
                cur_byte = next_byte;
            } else {
                break;
            }
        }

        cur_utf16
    }

    fn utf16_col_to_byte(&self, source: &str, target_utf16_col: usize) -> usize {
        if target_utf16_col == 0 {
            return self.start;
        }

        let line = &source[self.start..self.end];
        let mut cur_byte = self.start;
        let mut cur_utf16 = 0usize;

        for (rel, ch) in line.char_indices() {
            if cur_utf16 >= target_utf16_col {
                return self.start + rel;
            }
            cur_utf16 += ch.len_utf16();
            cur_byte = self.start + rel + ch.len_utf8();
            if cur_utf16 >= target_utf16_col {
                return cur_byte;
            }
        }

        cur_byte.min(self.end)
    }
}

#[derive(Debug, Clone, Copy)]
struct Utf16Checkpoint {
    byte: usize,
    utf16_col: usize,
}

fn line_for_byte(source: &str, lines: &[Utf16LineTable], byte: usize) -> usize {
    if lines.is_empty() {
        return 0;
    }

    let clamped = byte.min(source.len());
    lines
        .partition_point(|line| line.start <= clamped)
        .saturating_sub(1)
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
    use super::IndexedText;

    #[test]
    fn slice_reports_relative_line_and_utf16_columns() {
        let source = IndexedText::new("ab😀\nxyz\n");
        let slice = source.slice(1.."ab😀\nxy".len());

        assert_eq!(slice.byte_to_line_utf16_col(0), (0, 0));
        assert_eq!(slice.byte_to_line_utf16_col("b😀".len()), (0, 3));
        assert_eq!(slice.byte_to_line_utf16_col("b😀\n".len()), (1, 0));
        assert_eq!(slice.byte_to_line_utf16_col("b😀\nx".len()), (1, 1));
    }
}
