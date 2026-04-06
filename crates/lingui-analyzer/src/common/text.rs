use tree_sitter::Node;

use super::Span;

pub(crate) fn node_text<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}

pub(crate) fn span_text(source: &str, span: Span) -> &str {
    &source[span.start..span.end]
}

pub(crate) fn unquote(text: &str) -> Option<&str> {
    if text.len() < 2 {
        return None;
    }

    let bytes = text.as_bytes();
    let quote = bytes.first().copied()?;
    if quote != b'"' && quote != b'\'' {
        return None;
    }

    if bytes.last().copied()? != quote {
        return None;
    }

    Some(&text[1..text.len() - 1])
}

pub(crate) fn is_component_tag_name(tag_name: &str) -> bool {
    tag_name
        .chars()
        .next()
        .map(|first| first.is_ascii_uppercase())
        .unwrap_or(false)
}
