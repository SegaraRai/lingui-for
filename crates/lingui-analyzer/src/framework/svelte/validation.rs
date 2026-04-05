use tree_sitter::Node;

use crate::common::Span;
use crate::diagnostics::svelte::{
    bare_direct_macro_usage, unsupported_block_syntax_in_trans,
    unsupported_special_element_in_trans,
};

use super::super::shared::helpers::text::text;
use super::super::{AnalyzeOptions, MacroCandidate};
use super::{SvelteFrameworkError, is_bare_direct_svelte_macro_forbidden};

pub fn validate_svelte_extract_candidates(
    source_name: &str,
    source: &str,
    candidates: &[MacroCandidate],
) -> Result<(), SvelteFrameworkError> {
    let offending_candidate = candidates
        .iter()
        .find(|candidate| is_bare_direct_svelte_macro_forbidden(candidate));

    if let Some(candidate) = offending_candidate {
        return Err(SvelteFrameworkError::InvalidMacroUsage(
            bare_direct_macro_usage(
                source,
                source_name,
                candidate.outer_span,
                candidate.imported_name.as_str(),
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
                    unsupported_block_syntax_in_trans(
                        source,
                        &options.source_name,
                        Span::from_node(node),
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
                unsupported_special_element_in_trans(
                    source,
                    &options.source_name,
                    Span::from_node(tag_name_node),
                    tag_name,
                ),
            ));
        }
    }

    Ok(())
}
