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

fn offset_to_line_column(source: &str, offset: usize) -> (usize, usize) {
    let bounded = offset.min(source.len());
    let mut line = 1usize;
    let mut column = 1usize;

    for character in source[..bounded].chars() {
        if character == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }

    (line, column)
}
