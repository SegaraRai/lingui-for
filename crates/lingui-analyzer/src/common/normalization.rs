use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tree_sitter::Node;
use tsify::Tsify;

use super::{Span, node_text, span_text};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NormalizationEdit {
    Delete { span: Span },
    Insert { at: usize, text: LeanString },
}

pub(crate) fn whitespace_replacement_edits(
    source: &str,
    children: &[Node<'_>],
    is_explicit_space_expression: impl Fn(&str, Node<'_>) -> bool,
) -> Vec<NormalizationEdit> {
    let mut edits = Vec::new();
    let meaningful_children = children
        .iter()
        .copied()
        .filter(|child| !node_text(source, *child).trim().is_empty())
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
        if !span_text(source, gap).trim().is_empty() {
            continue;
        }

        edits.push(NormalizationEdit::Delete { span: gap });
        edits.push(NormalizationEdit::Insert {
            at: gap.start,
            text: LeanString::from_static_str("{\" \"}"),
        });
    }

    edits
}

pub(crate) fn sort_and_dedup_normalization_edits(edits: &mut Vec<NormalizationEdit>) {
    fn normalization_edit_sort_key(edit: &NormalizationEdit) -> (usize, usize, u8, LeanString) {
        match edit {
            NormalizationEdit::Delete { span } => (span.start, span.end, 0, LeanString::new()),
            NormalizationEdit::Insert { at, text } => (*at, *at, 1, text.clone()),
        }
    }

    edits.sort_by_key(normalization_edit_sort_key);
    edits.dedup();
}
