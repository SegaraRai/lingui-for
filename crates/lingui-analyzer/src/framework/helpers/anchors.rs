use std::collections::BTreeSet;

use tree_sitter::Node;

pub(crate) fn collect_node_start_anchors(source: &str, root: Node<'_>) -> Vec<usize> {
    let mut anchors = BTreeSet::new();
    extend_node_start_anchors(root, 0, &mut anchors);
    extend_line_start_anchors(source, 0, &mut anchors);
    anchors.into_iter().collect()
}

pub(crate) fn extend_shifted_node_start_anchors(
    source: &str,
    root: Node<'_>,
    base_offset: usize,
    anchors: &mut Vec<usize>,
) {
    let mut merged = anchors.iter().copied().collect::<BTreeSet<_>>();
    extend_node_start_anchors(root, base_offset, &mut merged);
    extend_line_start_anchors(source, base_offset, &mut merged);
    *anchors = merged.into_iter().collect();
}

fn extend_node_start_anchors(root: Node<'_>, base_offset: usize, anchors: &mut BTreeSet<usize>) {
    let mut cursor = root.walk();
    let mut stack = vec![root];

    while let Some(node) = stack.pop() {
        if node.end_byte() > node.start_byte() {
            anchors.insert(base_offset + node.start_byte());
        }

        let mut children = node.children(&mut cursor).collect::<Vec<_>>();
        children.reverse();
        stack.extend(children);
    }
}

fn extend_line_start_anchors(source: &str, base_offset: usize, anchors: &mut BTreeSet<usize>) {
    anchors.insert(base_offset);
    for (index, byte) in source.bytes().enumerate() {
        if byte == b'\n' {
            anchors.insert(base_offset + index + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::collect_node_start_anchors;
    use crate::framework::parse::parse_svelte;

    #[test]
    fn includes_line_starts_without_duplicates() {
        let source = "<script>\nconst x = 1;\n</script>\n<p>{x}</p>\n";
        let tree = parse_svelte(source).expect("parse");
        let anchors = collect_node_start_anchors(source, tree.root_node());

        assert!(anchors.contains(&0));
        assert!(anchors.contains(&9));
        assert!(anchors.contains(&22));
        assert!(anchors.contains(&32));
        assert!(anchors.contains(&43));

        let mut sorted = anchors.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(anchors, sorted);
    }
}
