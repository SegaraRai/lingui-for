use crate::common::Span;

use super::LinguiAnalyzerDiagnostic;

pub fn unsupported_special_element_in_trans(
    source: &str,
    filename: &str,
    span: Span,
    tag_name: &str,
) -> LinguiAnalyzerDiagnostic {
    LinguiAnalyzerDiagnostic::new(
        source,
        filename,
        span,
        format!(
            "Astro special element `<{tag_name}>` is not supported inside <Trans> because it cannot be lowered to a runtime message."
        ),
    )
}

pub fn unsupported_directive_in_trans(
    source: &str,
    filename: &str,
    span: Span,
    directive_name: &str,
) -> LinguiAnalyzerDiagnostic {
    LinguiAnalyzerDiagnostic::new(
        source,
        filename,
        span,
        format!(
            "Astro directive `{directive_name}` is not supported inside <Trans> because it cannot be lowered to a runtime message."
        ),
    )
}
