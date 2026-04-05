use std::borrow::Cow;

use tree_sitter::Node;

use crate::common::{Span, format_invalid_macro_usage, format_unsupported_trans_child_syntax};

use super::super::shared::helpers::text::text;
use super::super::{AnalyzeOptions, MacroCandidate, MacroCandidateStrategy, MacroFlavor};
use super::SvelteFrameworkError;

fn bare_direct_macro_error(imported_name: &str) -> SvelteFrameworkError {
    match imported_name {
        "t" => SvelteFrameworkError::BareDirectTNotAllowed,
        "plural" => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Borrowed("plural"),
        },
        "select" => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Borrowed("select"),
        },
        "selectOrdinal" => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Borrowed("selectOrdinal"),
        },
        other => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Owned(other.to_string()),
        },
    }
}

pub(crate) fn bare_direct_macro_message(imported_name: &str) -> String {
    match bare_direct_macro_error(imported_name) {
        SvelteFrameworkError::BareDirectTNotAllowed => {
            "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string()
        }
        SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager { imported_name } => format!(
            "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
        ),
        _ => unreachable!("unexpected bare direct macro error variant"),
    }
}

pub fn validate_svelte_extract_candidates(
    source_name: &str,
    source: &str,
    candidates: &[MacroCandidate],
) -> Result<(), SvelteFrameworkError> {
    let offending_candidate = candidates.iter().find(|candidate| {
        candidate.strategy == MacroCandidateStrategy::Standalone
            && candidate.flavor == MacroFlavor::Direct
            && matches!(
                candidate.imported_name.as_str(),
                "t" | "plural" | "select" | "selectOrdinal"
            )
    });

    if let Some(candidate) = offending_candidate {
        return Err(SvelteFrameworkError::InvalidMacroUsage(
            format_invalid_macro_usage(
                source,
                source_name,
                candidate.outer_span,
                bare_direct_macro_message(candidate.imported_name.as_str()),
            ),
        ));
    }

    Ok(())
}

pub(super) fn validate_runtime_lowerable_svelte_component(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), SvelteFrameworkError> {
    fn validate_node(
        source: &str,
        node: Node<'_>,
        options: &AnalyzeOptions,
    ) -> Result<(), SvelteFrameworkError> {
        match node.kind() {
            "if_statement" | "each_statement" | "await_statement" | "key_statement"
            | "snippet_statement" | "const_tag" => {
                return Err(SvelteFrameworkError::InvalidMacroUsage(
                    format_unsupported_trans_child_syntax(
                        source,
                        &options.source_name,
                        Span::from_node(node),
                        "Svelte block syntax",
                    ),
                ));
            }
            "element" | "self_closing_tag" => {
                validate_svelte_element_like(source, node, options)?;
            }
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            validate_node(source, child, options)?;
        }

        Ok(())
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        validate_node(source, child, options)?;
    }

    Ok(())
}

fn validate_svelte_element_like(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), SvelteFrameworkError> {
    let tag = match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag"),
        "self_closing_tag" => Some(node),
        _ => None,
    };
    let Some(tag) = tag else {
        return Ok(());
    };

    if let Some(tag_name_node) = tag
        .children(&mut tag.walk())
        .find(|child| child.kind() == "tag_name")
    {
        let tag_name = text(source, tag_name_node);
        if tag_name == "slot" || tag_name.starts_with("svelte:") {
            return Err(SvelteFrameworkError::InvalidMacroUsage(
                format_unsupported_trans_child_syntax(
                    source,
                    &options.source_name,
                    Span::from_node(tag_name_node),
                    format!("Svelte special element `<{tag_name}>`"),
                ),
            ));
        }
    }

    Ok(())
}
