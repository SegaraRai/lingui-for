pub mod astro;
mod expression;
pub mod js;
pub mod parse;
pub mod scope;
pub mod svelte;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::Span;
use crate::conventions::FrameworkConventions;

pub use astro::AstroFrameworkError;
pub use js::JsAnalysisError;
pub use parse::ParseError;
pub use svelte::SvelteFrameworkError;

#[derive(thiserror::Error, Debug)]
pub enum FrameworkError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error(transparent)]
    Astro(#[from] AstroFrameworkError),
    #[error(transparent)]
    Svelte(#[from] SvelteFrameworkError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct MacroImport {
    pub source: String,
    pub imported_name: String,
    pub local_name: String,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroCandidateKind {
    CallExpression,
    TaggedTemplateExpression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroFlavor {
    Direct,
    Reactive,
    Eager,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroCandidateStrategy {
    Standalone,
    OwnedByParent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NormalizationEdit {
    Delete { span: Span },
    Insert { at: usize, text: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum WhitespaceMode {
    Jsx,
    Astro,
    Svelte,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct MacroCandidate {
    pub id: String,
    pub kind: MacroCandidateKind,
    pub imported_name: String,
    pub local_name: String,
    pub flavor: MacroFlavor,
    pub outer_span: Span,
    pub normalized_span: Span,
    pub normalization_edits: Vec<NormalizationEdit>,
    pub source_map_anchor: Option<Span>,
    pub owner_id: Option<String>,
    pub strategy: MacroCandidateStrategy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeOptions {
    pub whitespace: WhitespaceMode,
    pub conventions: FrameworkConventions,
}

pub trait FrameworkAdapter {
    type Analysis;

    fn analyze(
        &self,
        source: &str,
        options: &AnalyzeOptions,
    ) -> Result<Self::Analysis, FrameworkError>;
}
