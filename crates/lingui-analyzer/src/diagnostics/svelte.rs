use crate::common::Span;

use super::LinguiAnalyzerDiagnostic;

pub fn bare_direct_macro_usage(
    source: &str,
    filename: &str,
    span: Span,
    imported_name: &str,
) -> LinguiAnalyzerDiagnostic {
    let message = match imported_name {
        "t" => "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string(),
        imported_name => format!(
            "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
        ),
    };
    LinguiAnalyzerDiagnostic::new(source, filename, span, message)
}

pub fn module_script_must_use_core_macro_package(
    source: &str,
    filename: &str,
    span: Span,
) -> LinguiAnalyzerDiagnostic {
    LinguiAnalyzerDiagnostic::new(
        source,
        filename,
        span,
        "Module scripts in `.svelte` files must import Lingui macros from `@lingui/core/macro`, not `lingui-for-svelte/macro`.",
    )
}

pub fn unsupported_block_syntax_in_trans(
    source: &str,
    filename: &str,
    span: Span,
) -> LinguiAnalyzerDiagnostic {
    LinguiAnalyzerDiagnostic::new(
        source,
        filename,
        span,
        "Svelte block syntax is not supported inside <Trans> because it cannot be lowered to a runtime message.",
    )
}

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
            "Svelte special element `<{tag_name}>` is not supported inside <Trans> because it cannot be lowered to a runtime message."
        ),
    )
}
