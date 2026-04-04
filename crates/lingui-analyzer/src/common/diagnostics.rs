use crate::common::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LinguiDiagnostic {
    pub(crate) filename: String,
    pub(crate) span: Span,
    pub(crate) message: String,
}

pub(crate) fn make_diagnostic(
    filename: impl Into<String>,
    span: Span,
    message: impl Into<String>,
) -> LinguiDiagnostic {
    LinguiDiagnostic {
        filename: filename.into(),
        span,
        message: message.into(),
    }
}

pub(crate) fn format_single_diagnostic(source: &str, diagnostic: &LinguiDiagnostic) -> String {
    let (line, column) = offset_to_line_column(source, diagnostic.span.start);
    format!(
        "{}:{}:{}: {}",
        diagnostic.filename, line, column, diagnostic.message
    )
}

pub(crate) fn format_invalid_macro_usage(
    source: &str,
    filename: &str,
    span: Span,
    message: impl Into<String>,
) -> String {
    format_single_diagnostic(source, &make_diagnostic(filename, span, message))
}

pub(crate) fn format_unsupported_trans_child_syntax(
    source: &str,
    filename: &str,
    span: Span,
    subject: impl AsRef<str>,
) -> String {
    format_invalid_macro_usage(
        source,
        filename,
        span,
        format!(
            "{} is not supported inside <Trans> because it cannot be lowered to a runtime message.",
            subject.as_ref()
        ),
    )
}

fn offset_to_line_column(source: &str, offset: usize) -> (usize, usize) {
    let bounded = offset.min(source.len());
    let mut line = 1usize;
    let mut column = 1usize;

    for character in source[..bounded].chars() {
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
}
