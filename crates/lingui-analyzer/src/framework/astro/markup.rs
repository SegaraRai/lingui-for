use tree_sitter::Node;

use crate::common::{Span, span_text};

use super::non_empty_tag_name_node;

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

    span_text(source, Span::new_unchecked(inner.start, root.start_byte()))
        .trim()
        .is_empty()
        && span_text(source, Span::new_unchecked(root.end_byte(), inner.end))
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
        || non_empty_tag_name_node(start_tag).is_some()
        || non_empty_tag_name_node(end_tag).is_some()
    {
        return None;
    }

    if !span_text(
        source,
        Span::new_unchecked(inner.start, start_tag.start_byte()),
    )
    .trim()
    .is_empty()
        || !span_text(source, Span::new_unchecked(end_tag.end_byte(), inner.end))
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

pub(crate) fn is_fragment_wrapper(node: Node<'_>) -> bool {
    if node.kind() != "element" {
        return false;
    }

    let mut found_start_none = false;
    let mut found_end_none = false;
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "start_tag" if non_empty_tag_name_node(child).is_none() => found_start_none = true,
            "end_tag" if non_empty_tag_name_node(child).is_none() => found_end_none = true,
            _ => {}
        }
    }

    found_start_none && found_end_none
}

#[cfg(test)]
mod tests {
    use tree_sitter::Node;

    use crate::syntax::parse::parse_astro;

    use super::*;

    fn with_html_interpolation<R>(source: &str, test: impl FnOnce(Span, Vec<Node<'_>>) -> R) -> R {
        let tree = parse_astro(source).expect("source parses as Astro");
        let interpolation =
            find_first_node(tree.root_node(), "html_interpolation").expect("interpolation exists");
        let inner =
            Span::new_unchecked(interpolation.start_byte() + 1, interpolation.end_byte() - 1);
        let children = named_children_in_span(source, interpolation, inner);
        test(inner, children)
    }

    fn find_first_node<'a>(node: Node<'a>, kind: &str) -> Option<Node<'a>> {
        if node.kind() == kind {
            return Some(node);
        }

        let mut cursor = node.walk();
        node.children(&mut cursor)
            .find_map(|child| find_first_node(child, kind))
    }

    #[test]
    fn ignores_blank_text_children_around_single_root_interpolation() {
        with_html_interpolation("{ <span /> }", |inner, children| {
            assert_eq!(children.len(), 1);
            assert!(is_single_root_interpolation(
                "{ <span /> }",
                inner,
                &children
            ));
            assert!(!is_rich_node_expression_interpolation(
                "{ <span /> }",
                inner,
                &children
            ));
        });
    }

    #[test]
    fn classifies_comment_only_interpolation_as_not_rich() {
        with_html_interpolation("{<!-- comment -->}", |inner, children| {
            assert!(is_comment_only_interpolation(&children));
            assert!(!is_rich_node_expression_interpolation(
                "{<!-- comment -->}",
                inner,
                &children
            ));
        });
    }

    #[test]
    fn treats_fragment_root_interpolation_as_not_rich() {
        with_html_interpolation("{ <><span /></> }", |inner, children| {
            assert_eq!(children.len(), 1);
            assert!(is_fragment_wrapper(children[0]));
            assert!(!is_rich_node_expression_interpolation(
                "{ <><span /></> }",
                inner,
                &children
            ));
        });
    }

    #[test]
    fn treats_comment_adjacent_markup_as_rich_root_list() {
        with_html_interpolation("{<!-- comment --><span />}", |inner, children| {
            assert!(is_rich_node_expression_interpolation(
                "{<!-- comment --><span />}",
                inner,
                &children
            ));
        });
    }
}
