use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tree_sitter::Node;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EmbeddedScriptKind {
    Frontmatter,
    Script,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbeddedScriptRegion {
    pub kind: EmbeddedScriptKind,
    pub outer_span: Span,
    pub inner_span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroImport {
    pub source: String,
    pub imported_name: String,
    pub local_name: String,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacroCandidateKind {
    CallExpression,
    TaggedTemplateExpression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacroFlavor {
    Direct,
    Reactive,
    Eager,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroCandidate {
    pub kind: MacroCandidateKind,
    pub imported_name: String,
    pub local_name: String,
    pub flavor: MacroFlavor,
    pub outer_span: Span,
    pub normalized_span: Span,
    pub strip_spans: Vec<Span>,
    pub source_map_anchor: Option<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct SyntheticModule {
    pub source: String,
    pub source_name: String,
    pub synthetic_name: String,
    pub source_map_json: Option<String>,
    pub declaration_ids: Vec<String>,
    pub original_spans: BTreeMap<String, Span>,
    pub generated_spans: BTreeMap<String, Span>,
    pub mappings: Vec<SyntheticMapping>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyntheticModuleOptions {
    pub framework: String,
    pub source: String,
    pub source_name: Option<String>,
    pub synthetic_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyntheticMapping {
    pub declaration_id: String,
    pub original_span: Span,
    pub generated_span: Span,
    pub source_map_anchor: Option<Span>,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedSegment {
    pub original_start: usize,
    pub generated_start: usize,
    pub len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplacementChunk {
    pub declaration_id: String,
    pub original_span: Span,
    pub replacement: String,
    pub source_map_anchor: Option<Span>,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReinsertOptions {
    pub original_source: String,
    pub source_name: Option<String>,
    pub synthetic_module: SyntheticModule,
    pub transformed_declarations: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ReinsertedModule {
    pub code: String,
    pub source_name: String,
    pub source_map_json: Option<String>,
}
