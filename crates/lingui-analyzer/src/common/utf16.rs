#[derive(Debug, Clone)]
pub struct Utf16Index<'a> {
    source: &'a str,
    line_starts: Vec<usize>,
    lines: Vec<Utf16LineIndex>,
}

impl<'a> Utf16Index<'a> {
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
            lines.push(Utf16LineIndex::new(source, start, end));
        }
        Self {
            source,
            line_starts: line_starts.to_vec(),
            lines,
        }
    }

    pub fn byte_to_line_utf16_col(&self, byte: usize) -> (usize, usize) {
        let line = self.line_for_byte(byte);
        let col = self.lines[line].byte_to_utf16_col(self.source, byte);
        (line, col)
    }

    fn line_for_byte(&self, byte: usize) -> usize {
        self.line_starts
            .partition_point(|&probe| probe <= byte)
            .saturating_sub(1)
    }
}

#[derive(Debug, Clone)]
struct Utf16LineIndex {
    start: usize,
    end: usize,
    checkpoints: Vec<Utf16Checkpoint>,
}

impl Utf16LineIndex {
    const CHECKPOINT_STRIDE_CHARS: usize = 64;

    fn new(source: &str, start: usize, end: usize) -> Self {
        let mut checkpoints = vec![Utf16Checkpoint {
            byte: start,
            utf16_col: 0,
        }];

        let mut utf16_col: usize = 0;
        let mut char_count: usize = 0;

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
}

#[derive(Debug, Clone, Copy)]
struct Utf16Checkpoint {
    byte: usize,
    utf16_col: usize,
}

#[cfg(test)]
mod tests {
    use super::Utf16Index;

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
        let index = Utf16Index::new(source, &line_starts(source));

        assert_eq!(index.byte_to_line_utf16_col(0), (0, 0));
        assert_eq!(index.byte_to_line_utf16_col(3), (0, 1));
        assert_eq!(index.byte_to_line_utf16_col(7), (0, 3));
        assert_eq!(index.byte_to_line_utf16_col(8), (0, 4));
    }

    #[test]
    fn resolves_line_starts_at_exact_boundaries() {
        let source = "ab\ncd\nef";
        let index = Utf16Index::new(source, &line_starts(source));

        assert_eq!(index.byte_to_line_utf16_col(0), (0, 0));
        assert_eq!(index.byte_to_line_utf16_col(2), (0, 2));
        assert_eq!(index.byte_to_line_utf16_col(3), (1, 0));
        assert_eq!(index.byte_to_line_utf16_col(5), (1, 2));
        assert_eq!(index.byte_to_line_utf16_col(6), (2, 0));
    }

    #[test]
    fn treats_crlf_as_line_break_without_counting_cr() {
        let source = "ab\r\ncd\r\nef";
        let index = Utf16Index::new(source, &line_starts(source));

        assert_eq!(index.byte_to_line_utf16_col(0), (0, 0));
        assert_eq!(index.byte_to_line_utf16_col(2), (0, 2));
        assert_eq!(index.byte_to_line_utf16_col(3), (0, 2));
        assert_eq!(index.byte_to_line_utf16_col(4), (1, 0));
        assert_eq!(index.byte_to_line_utf16_col(6), (1, 2));
        assert_eq!(index.byte_to_line_utf16_col(7), (1, 2));
        assert_eq!(index.byte_to_line_utf16_col(8), (2, 0));
        assert_eq!(index.byte_to_line_utf16_col(10), (2, 2));
    }

    #[test]
    fn clamps_past_end_to_last_line_end() {
        let source = "ab\n🙂x";
        let index = Utf16Index::new(source, &line_starts(source));

        assert_eq!(index.byte_to_line_utf16_col(source.len()), (1, 3));
        assert_eq!(index.byte_to_line_utf16_col(source.len() + 10), (1, 3));
    }

    #[test]
    fn handles_empty_lines_and_unicode_across_lines() {
        let source = "🙂\n\néx";
        let index = Utf16Index::new(source, &line_starts(source));

        assert_eq!(index.byte_to_line_utf16_col(0), (0, 0));
        assert_eq!(index.byte_to_line_utf16_col(4), (0, 2));
        assert_eq!(index.byte_to_line_utf16_col(5), (1, 0));
        assert_eq!(index.byte_to_line_utf16_col(6), (2, 0));
        assert_eq!(index.byte_to_line_utf16_col(8), (2, 1));
        assert_eq!(index.byte_to_line_utf16_col(9), (2, 2));
    }
}
