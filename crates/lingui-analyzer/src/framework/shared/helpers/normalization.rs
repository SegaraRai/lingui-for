use tree_sitter::Node;

use crate::common::Span;
use crate::framework::NormalizationEdit;

pub(crate) fn whitespace_replacement_edits(
    source: &str,
    children: &[Node<'_>],
    is_explicit_space_expression: impl Fn(&str, Node<'_>) -> bool,
) -> Vec<NormalizationEdit> {
    let mut edits = Vec::new();
    let meaningful_children = children
        .iter()
        .copied()
        .filter(|child| {
            let span = Span::from_node(*child);
            !source[span.start..span.end].trim().is_empty()
        })
        .collect::<Vec<_>>();

    for pair in meaningful_children.windows(2) {
        let previous = pair[0];
        let next = pair[1];
        if is_explicit_space_expression(source, previous)
            || is_explicit_space_expression(source, next)
        {
            continue;
        }
        let gap = Span::new(previous.end_byte(), next.start_byte());
        if gap.start >= gap.end {
            continue;
        }
        if !source[gap.start..gap.end].trim().is_empty() {
            continue;
        }

        edits.push(NormalizationEdit::Delete { span: gap });
        edits.push(NormalizationEdit::Insert {
            at: gap.start,
            text: "{\" \"}".to_string(),
        });
    }

    edits
}

pub(crate) fn sort_and_dedup_normalization_edits(edits: &mut Vec<NormalizationEdit>) {
    fn normalization_edit_sort_key(edit: &NormalizationEdit) -> (usize, usize, u8, String) {
        match edit {
            NormalizationEdit::Delete { span } => (span.start, span.end, 0, String::new()),
            NormalizationEdit::Insert { at, text } => (*at, *at, 1, text.clone()),
        }
    }

    edits.sort_by_key(normalization_edit_sort_key);
    edits.dedup();
}
