use std::collections::BTreeMap;

use tree_sitter::Node;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbeddedScriptKind {
    Frontmatter,
    Script,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmbeddedScriptRegion {
    pub kind: EmbeddedScriptKind,
    pub outer_span: Span,
    pub inner_span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MacroImport {
    pub source: String,
    pub imported_name: String,
    pub local_name: String,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacroCandidateKind {
    CallExpression,
    TaggedTemplateExpression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacroFlavor {
    Direct,
    Reactive,
    Eager,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MacroCandidate {
    pub kind: MacroCandidateKind,
    pub imported_name: String,
    pub local_name: String,
    pub flavor: MacroFlavor,
    pub outer_span: Span,
    pub normalized_span: Span,
    pub strip_spans: Vec<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SyntheticModule {
    pub source: String,
    pub declaration_ids: Vec<String>,
    pub original_spans: BTreeMap<String, Span>,
    pub generated_spans: BTreeMap<String, Span>,
    pub mappings: Vec<SyntheticMapping>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntheticMapping {
    pub declaration_id: String,
    pub original_span: Span,
    pub generated_span: Span,
}
