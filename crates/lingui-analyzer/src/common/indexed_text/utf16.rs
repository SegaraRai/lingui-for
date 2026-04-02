use std::ops::Range;

#[derive(Debug, Clone)]
pub struct Utf16Table<'a> {
    source: &'a str,
    lines: Vec<Utf16LineTable<'a>>,
}

impl<'a> Utf16Table<'a> {
    pub fn new(source: &'a str, line_starts: &[usize]) -> Self {
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
        Self { source, lines }
    }

    pub fn byte_to_line_utf16_col(&self, byte: usize) -> Option<(usize, usize)> {
        let line = self.line_for_byte(byte)?;
        let col = self.lines[line].byte_to_utf16_col(byte);
        Some((line, col))
    }

    pub fn line_utf16_col_to_byte(&self, line: usize, utf16_col: usize) -> Option<usize> {
        let line_index = self.lines.get(line)?;
        line_index.utf16_col_to_byte(utf16_col)
    }

    pub fn line_for_byte(&self, byte: usize) -> Option<usize> {
        if byte > self.source.len() {
            return None;
        }
        Some(
            self.lines
                .partition_point(|line| line.start <= byte)
                .saturating_sub(1),
        )
    }

    pub fn relative_byte_to_line_utf16_col(
        &self,
        range: Range<usize>,
        local_byte: usize,
    ) -> Option<(usize, usize)> {
        if range.start > range.end || range.end > self.source.len() || local_byte > range.len() {
            return None;
        }

        let global_byte = range.start + local_byte;
        let slice_start_line = self.line_for_byte(range.start)?;
        let line = self.line_for_byte(global_byte)?;
        let line_start = if line == slice_start_line {
            range.start
        } else {
            self.lines.get(line)?.start
        };
        let utf16_col = self.byte_to_line_utf16_col(global_byte)?.1;
        let line_start_utf16_col = self.byte_to_line_utf16_col(line_start)?.1;

        Some((line - slice_start_line, utf16_col - line_start_utf16_col))
    }
}

#[derive(Debug, Clone)]
struct Utf16LineTable<'a> {
    start: usize,
    end: usize,
    line: &'a str,
    checkpoints: Vec<Utf16Checkpoint>,
}

impl<'a> Utf16LineTable<'a> {
    const CHECKPOINT_STRIDE_CHARS: usize = 64;

    fn new(source: &'a str, start: usize, end: usize) -> Self {
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
            line: &source[start..end],
            checkpoints,
        }
    }

    fn byte_to_utf16_col(&self, abs_byte: usize) -> usize {
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

        while cur_byte < clamped {
            let rel = cur_byte - self.start;
            let Some(ch) = self.line[rel..].chars().next() else {
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

    fn utf16_col_to_byte(&self, target_utf16_col: usize) -> Option<usize> {
        if target_utf16_col == 0 {
            return Some(self.start);
        }

        let mut cur_byte = self.start;
        let mut cur_utf16 = 0usize;

        for (rel, ch) in self.line.char_indices() {
            if cur_utf16 == target_utf16_col {
                return Some(self.start + rel);
            }
            cur_utf16 += ch.len_utf16();
            cur_byte = self.start + rel + ch.len_utf8();
            if cur_utf16 == target_utf16_col {
                return Some(cur_byte);
            }
            if cur_utf16 > target_utf16_col {
                return None;
            }
        }

        (cur_utf16 == target_utf16_col).then_some(cur_byte.min(self.end))
    }
}

#[derive(Debug, Clone, Copy)]
struct Utf16Checkpoint {
    byte: usize,
    utf16_col: usize,
}

#[cfg(test)]
mod tests {
    use super::Utf16Table;

    fn line_starts(source: &str) -> Vec<usize> {
        let mut starts = vec![0];
        for (index, byte) in source.bytes().enumerate() {
            if byte == b'\n' {
                starts.push(index + 1);
            }
        }
        starts
    }

    #[test]
    fn uses_utf16_columns_for_unicode() {
        let source = "あ🙂x";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.byte_to_line_utf16_col(0), Some((0, 0)));
        assert_eq!(table.byte_to_line_utf16_col(3), Some((0, 1)));
        assert_eq!(table.byte_to_line_utf16_col(7), Some((0, 3)));
        assert_eq!(table.byte_to_line_utf16_col(8), Some((0, 4)));
    }

    #[test]
    fn resolves_line_starts_at_exact_boundaries() {
        let source = "ab\ncd\nef";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.byte_to_line_utf16_col(0), Some((0, 0)));
        assert_eq!(table.byte_to_line_utf16_col(2), Some((0, 2)));
        assert_eq!(table.byte_to_line_utf16_col(3), Some((1, 0)));
        assert_eq!(table.byte_to_line_utf16_col(5), Some((1, 2)));
        assert_eq!(table.byte_to_line_utf16_col(6), Some((2, 0)));
    }

    #[test]
    fn treats_crlf_as_line_break_without_counting_cr() {
        let source = "ab\r\ncd\r\nef";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.byte_to_line_utf16_col(0), Some((0, 0)));
        assert_eq!(table.byte_to_line_utf16_col(2), Some((0, 2)));
        assert_eq!(table.byte_to_line_utf16_col(3), Some((0, 2)));
        assert_eq!(table.byte_to_line_utf16_col(4), Some((1, 0)));
        assert_eq!(table.byte_to_line_utf16_col(6), Some((1, 2)));
        assert_eq!(table.byte_to_line_utf16_col(7), Some((1, 2)));
        assert_eq!(table.byte_to_line_utf16_col(8), Some((2, 0)));
        assert_eq!(table.byte_to_line_utf16_col(10), Some((2, 2)));
    }

    #[test]
    fn rejects_past_end_offsets() {
        let source = "ab\n🙂x";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.byte_to_line_utf16_col(source.len()), Some((1, 3)));
        assert_eq!(table.byte_to_line_utf16_col(source.len() + 10), None);
    }

    #[test]
    fn handles_empty_lines_and_unicode_across_lines() {
        let source = "🙂\n\néx";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.byte_to_line_utf16_col(0), Some((0, 0)));
        assert_eq!(table.byte_to_line_utf16_col(4), Some((0, 2)));
        assert_eq!(table.byte_to_line_utf16_col(5), Some((1, 0)));
        assert_eq!(table.byte_to_line_utf16_col(6), Some((2, 0)));
        assert_eq!(table.byte_to_line_utf16_col(8), Some((2, 1)));
        assert_eq!(table.byte_to_line_utf16_col(9), Some((2, 2)));
    }

    #[test]
    fn converts_utf16_columns_back_to_byte_offsets() {
        let source = "🙂x\nab";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.line_utf16_col_to_byte(0, 0), Some(0));
        assert_eq!(table.line_utf16_col_to_byte(0, 2), Some(4));
        assert_eq!(table.line_utf16_col_to_byte(0, 3), Some(5));
        assert_eq!(table.line_utf16_col_to_byte(1, 0), Some(6));
        assert_eq!(table.line_utf16_col_to_byte(1, 2), Some(8));
        assert_eq!(table.line_utf16_col_to_byte(2, 0), None);
    }

    #[test]
    fn rejects_invalid_utf16_columns_inside_surrogates_and_past_end() {
        let source = "🙂x\nab";
        let table = Utf16Table::new(source, &line_starts(source));

        assert_eq!(table.line_utf16_col_to_byte(0, 1), None);
        assert_eq!(table.line_utf16_col_to_byte(0, 4), None);
        assert_eq!(table.line_utf16_col_to_byte(1, 3), None);
    }

    #[test]
    fn resolves_relative_slice_positions() {
        let source = "ab😀\nxyz\n";
        let table = Utf16Table::new(source, &line_starts(source));
        let range = 1.."ab😀\nxy".len();

        assert_eq!(
            table.relative_byte_to_line_utf16_col(range.clone(), 0),
            Some((0, 0))
        );
        assert_eq!(
            table.relative_byte_to_line_utf16_col(range.clone(), "b😀".len()),
            Some((0, 3))
        );
        assert_eq!(
            table.relative_byte_to_line_utf16_col(range.clone(), "b😀\n".len()),
            Some((1, 0))
        );
        assert_eq!(
            table.relative_byte_to_line_utf16_col(range.clone(), "b😀\nx".len()),
            Some((1, 1))
        );
        assert_eq!(table.relative_byte_to_line_utf16_col(range, 99), None);
    }
}
