use tree_sitter::Node;

use crate::common::Span;

use super::text::text;

pub(crate) fn first_non_whitespace_child_anchor(
    source: &str,
    node: Node<'_>,
    ignored_kinds: &[&str],
) -> Option<Span> {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if ignored_kinds.iter().any(|kind| *kind == child.kind()) {
            continue;
        }

        let child_text = text(source, child);
        if let Some(trimmed_start) = child_text.find(|char: char| !char.is_whitespace()) {
            return Some(Span::new(
                child.start_byte() + trimmed_start,
                child.end_byte(),
            ));
        }
    }

    None
}
