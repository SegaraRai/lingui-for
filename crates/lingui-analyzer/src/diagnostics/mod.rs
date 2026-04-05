use std::fmt::{self, Display, Formatter};

use crate::common::Span;

pub(crate) mod astro;
pub(crate) mod svelte;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinguiAnalyzerDiagnostic {
    filename: String,
    span: Span,
    loc_line: usize,
    loc_column: usize,
    message: String,
}

impl Display for LinguiAnalyzerDiagnostic {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}:{}:{}: {}",
            self.filename, self.loc_line, self.loc_column, self.message
        )
    }
}

impl LinguiAnalyzerDiagnostic {
    fn new(
        source: &str,
        filename: impl Into<String>,
        span: Span,
        message: impl Into<String>,
    ) -> Self {
        let (loc_line, loc_column) = offset_to_line_column(source, span.start);
        LinguiAnalyzerDiagnostic {
            filename: filename.into(),
            span,
            loc_line,
            loc_column,
            message: message.into(),
        }
    }

    pub fn span(&self) -> Span {
        self.span
    }
}

fn offset_to_line_column(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 1usize;
    let mut column = 1usize;

    for (byte_index, character) in source.char_indices() {
        if byte_index >= offset {
            break;
        }
        if character == '\n' {
            line += 1;
            column = 1;
        } else {
            column += character.len_utf16();
        }
    }

    (line, column)
}

#[cfg(test)]
mod tests {
    use super::offset_to_line_column;

    #[test]
    fn counts_utf16_columns_for_surrogate_pairs() {
        let source = "a😀b\nx";

        assert_eq!(offset_to_line_column(source, 0), (1, 1));
        assert_eq!(offset_to_line_column(source, 1), (1, 2));
        assert_eq!(offset_to_line_column(source, 5), (1, 4));
        assert_eq!(offset_to_line_column(source, 6), (1, 5));
        assert_eq!(offset_to_line_column(source, 7), (2, 1));
    }

    #[test]
    fn handles_edge_cases() {
        assert_eq!(offset_to_line_column("", 0), (1, 1));
        assert_eq!(offset_to_line_column("abc", 100), (1, 4));
    }
}
