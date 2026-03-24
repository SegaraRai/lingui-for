pub mod astro;
pub mod js;
pub mod parse;
pub mod scope;
pub mod svelte;

use serde::{Deserialize, Serialize};

use crate::AnalyzerError;
use crate::common::Span;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacroCandidateStrategy {
    Standalone,
    OwnedByParent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroCandidate {
    pub id: String,
    pub kind: MacroCandidateKind,
    pub imported_name: String,
    pub local_name: String,
    pub flavor: MacroFlavor,
    pub outer_span: Span,
    pub normalized_span: Span,
    pub strip_spans: Vec<Span>,
    pub source_map_anchor: Option<Span>,
    pub owner_id: Option<String>,
    pub strategy: MacroCandidateStrategy,
}

pub trait FrameworkAdapter {
    type Analysis;

    fn analyze(&self, source: &str) -> Result<Self::Analysis, AnalyzerError>;
}
