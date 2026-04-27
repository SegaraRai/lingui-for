use tree_sitter::Node;

use crate::common::{Span, node_text, span_text};

pub(crate) fn named_children_in_span<'a>(
    source: &str,
    node: Node<'a>,
    span: Span,
) -> Vec<Node<'a>> {
    // Empty trimmed text nodes are intentionally ignored so comment-only and
    // single-root interpolation checks operate on semantic children. Add any
    // future ignorable node kinds here and audit the child-slice consumers
    // below together to keep those predicates aligned.
    node.named_children(&mut node.walk())
        .filter(|child| child.end_byte() > span.start && child.start_byte() < span.end)
        .filter(|child| {
            !matches!(child.kind(), "text" | "permissible_text" | "raw_text")
                || !span_text(source, Span::from_node(*child)).trim().is_empty()
        })
        .collect()
}

pub(crate) fn is_comment_only_interpolation(children: &[Node<'_>]) -> bool {
    !children.is_empty() && children.iter().all(|child| child.kind() == "comment")
}

pub(crate) fn is_single_root_interpolation(
    source: &str,
    inner: Span,
    children: &[Node<'_>],
) -> bool {
    let [root] = children else {
        return false;
    };
    if !matches!(root.kind(), "element" | "self_closing_tag") {
        return false;
    }

    span_text(source, Span::new(inner.start, root.start_byte()))
        .trim()
        .is_empty()
        && span_text(source, Span::new(root.end_byte(), inner.end))
            .trim()
            .is_empty()
}

pub(crate) fn fragment_root_tag_pair<'a>(
    source: &str,
    inner: Span,
    children: &[Node<'a>],
) -> Option<(Node<'a>, Node<'a>)> {
    let start_tag = children.first().copied()?;
    let end_tag = children.last().copied()?;
    if start_tag.kind() != "start_tag"
        || end_tag.kind() != "end_tag"
        || tag_node_name(source, start_tag).is_some()
        || tag_node_name(source, end_tag).is_some()
    {
        return None;
    }

    if !span_text(source, Span::new(inner.start, start_tag.start_byte()))
        .trim()
        .is_empty()
        || !span_text(source, Span::new(end_tag.end_byte(), inner.end))
            .trim()
            .is_empty()
    {
        return None;
    }

    Some((start_tag, end_tag))
}

pub(crate) fn is_rich_node_expression_interpolation(
    source: &str,
    inner: Span,
    children: &[Node<'_>],
) -> bool {
    !is_comment_only_interpolation(children)
        && !is_single_root_interpolation(source, inner, children)
        && fragment_root_tag_pair(source, inner, children).is_none()
        && children.iter().any(|child| contains_rich_node(*child))
}

pub(crate) fn contains_rich_node(node: Node<'_>) -> bool {
    if matches!(
        node.kind(),
        "element" | "self_closing_tag" | "comment" | "start_tag" | "end_tag"
    ) {
        return true;
    }

    node.named_children(&mut node.walk())
        .any(contains_rich_node)
}

pub(crate) fn is_fragment_wrapper(source: &str, node: Node<'_>) -> bool {
    node.kind() == "element"
        && node
            .children(&mut node.walk())
            .any(|child| child.kind() == "start_tag" && tag_node_name(source, child).is_none())
        && node
            .children(&mut node.walk())
            .any(|child| child.kind() == "end_tag" && tag_node_name(source, child).is_none())
}

fn tag_node_name<'a>(source: &'a str, node: Node<'_>) -> Option<&'a str> {
    node.children(&mut node.walk())
        .find(|child| child.kind() == "tag_name")
        .map(|tag_name| node_text(source, tag_name))
}
