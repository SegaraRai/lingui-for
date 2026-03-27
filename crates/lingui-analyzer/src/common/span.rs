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

impl Span {
    pub const fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    pub fn from_node(node: Node<'_>) -> Self {
        Self::new(node.start_byte(), node.end_byte())
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
