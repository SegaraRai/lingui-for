use serde::{Deserialize, Serialize};
use tree_sitter::Node;
use tsify::Tsify;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(thiserror::Error, Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidSpan {
    #[error("invalid span: start={start}, end={end}")]
    Reversed { start: usize, end: usize },
}

impl Span {
    pub const fn new_unchecked(start: usize, end: usize) -> Self {
        debug_assert!(start <= end, "Span start must be less than or equal to end");
        Self { start, end }
    }

    pub const fn new(start: usize, end: usize) -> Result<Self, InvalidSpan> {
        if start <= end {
            Ok(Self { start, end })
        } else {
            Err(InvalidSpan::Reversed { start, end })
        }
    }

    pub fn from_node(node: Node<'_>) -> Self {
        Self::new_unchecked(node.start_byte(), node.end_byte())
    }

    pub const fn shifted(self, base_offset: usize) -> Self {
        Self::new_unchecked(self.start + base_offset, self.end + base_offset)
    }

    pub const fn zeroed(self) -> Self {
        debug_assert!(
            self.start <= self.end,
            "Span start must be less than or equal to end"
        );
        Self::new_unchecked(0, self.end - self.start)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum EmbeddedScriptKind {
    Frontmatter,
    Script,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedScriptRegion {
    pub kind: EmbeddedScriptKind,
    pub outer_span: Span,
    pub inner_span: Span,
}

#[cfg(test)]
mod tests {
    use super::{InvalidSpan, Span};

    #[test]
    fn try_new_rejects_reversed_spans() {
        assert_eq!(
            Span::new(3, 1),
            Err(InvalidSpan::Reversed { start: 3, end: 1 })
        );
    }

    #[test]
    fn try_new_allows_empty_spans() {
        assert_eq!(Span::new(2, 2), Ok(Span::new_unchecked(2, 2)));
    }
}
