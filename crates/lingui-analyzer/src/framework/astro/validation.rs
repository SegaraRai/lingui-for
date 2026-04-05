use tree_sitter::Node;

use crate::common::{Span, format_unsupported_trans_child_syntax};

use super::super::AnalyzeOptions;
use super::super::shared::helpers::text::text;
use super::AstroFrameworkError;

pub(super) fn validate_runtime_lowerable_astro_component(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), AstroFrameworkError> {
    validate_astro_component_node(source, node, options)
}

fn validate_astro_component_node(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), AstroFrameworkError> {
    if let Some((tag_name, tag_name_span)) = special_astro_tag_name(source, node) {
        return Err(AstroFrameworkError::InvalidMacroUsage(
            format_unsupported_trans_child_syntax(
                source,
                &options.source_name,
                tag_name_span,
                format!("Astro special element `<{tag_name}>`"),
            ),
        ));
    }

    if matches!(node.kind(), "element" | "self_closing_tag") {
        validate_astro_element_like(source, node, options)?;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        validate_astro_component_node(source, child, options)?;
    }

    Ok(())
}

fn special_astro_tag_name<'a>(source: &'a str, node: Node<'_>) -> Option<(&'a str, Span)> {
    let span = Span::from_node(node);
    let source_slice = &source[span.start..span.end];
    if source_slice.starts_with("<style")
        && source_slice
            .as_bytes()
            .get("<style".len())
            .is_none_or(|byte| byte.is_ascii_whitespace() || *byte == b'>')
    {
        return Some(("style", Span::new(span.start + 1, span.start + 6)));
    }

    if source_slice.starts_with("<script")
        && source_slice
            .as_bytes()
            .get("<script".len())
            .is_none_or(|byte| byte.is_ascii_whitespace() || *byte == b'>')
    {
        return Some(("script", Span::new(span.start + 1, span.start + 7)));
    }

    None
}

fn validate_astro_element_like(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), AstroFrameworkError> {
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

    if let Some((tag_name, tag_name_span)) = astro_tag_name(source, tag)
        && (tag_name == "script" || tag_name == "style")
    {
        return Err(AstroFrameworkError::InvalidMacroUsage(
            format_unsupported_trans_child_syntax(
                source,
                &options.source_name,
                tag_name_span,
                format!("Astro special element `<{tag_name}>`"),
            ),
        ));
    }

    let mut cursor = tag.walk();
    for child in tag.children(&mut cursor) {
        if child.kind() != "attribute" {
            continue;
        }
        let Some(name_node) = child
            .children(&mut child.walk())
            .find(|grandchild| grandchild.kind() == "attribute_name")
        else {
            continue;
        };
        let attribute_name = text(source, name_node);
        if is_unsupported_astro_directive(attribute_name) {
            return Err(AstroFrameworkError::InvalidMacroUsage(
                format_unsupported_trans_child_syntax(
                    source,
                    &options.source_name,
                    Span::from_node(name_node),
                    format!("Astro directive `{attribute_name}`"),
                ),
            ));
        }
    }

    Ok(())
}

fn astro_tag_name<'a>(source: &'a str, tag: Node<'_>) -> Option<(&'a str, Span)> {
    if let Some(tag_name_node) = tag
        .children(&mut tag.walk())
        .find(|child| child.kind() == "tag_name")
    {
        return Some((text(source, tag_name_node), Span::from_node(tag_name_node)));
    }

    let tag_span = Span::from_node(tag);
    let tag_text = &source[tag_span.start..tag_span.end];
    let relative_start = tag_text.find('<')? + 1;
    let relative_end = tag_text[relative_start..]
        .find(|char: char| char.is_ascii_whitespace() || char == '>' || char == '/')
        .map(|offset| relative_start + offset)
        .unwrap_or(tag_text.len());
    if relative_start >= relative_end {
        return None;
    }

    let start = tag_span.start + relative_start;
    let end = tag_span.start + relative_end;
    Some((&source[start..end], Span::new(start, end)))
}

fn is_unsupported_astro_directive(attribute_name: &str) -> bool {
    attribute_name == "is:raw"
}
