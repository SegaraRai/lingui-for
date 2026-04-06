mod analysis;
mod components;
mod validation;
mod walk;

use std::borrow::Cow;

use lean_string::LeanString;

use crate::common::{EmbeddedScriptRegion, Span};
use crate::conventions::MacroConventionsError;
use crate::diagnostics::LinguiAnalyzerDiagnostic;

use super::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, JsAnalysisError, MacroCandidate,
    MacroCandidateStrategy, MacroFlavor, MacroImport, ParseError,
};

pub use analysis::analyze_svelte;
pub use validation::validate_svelte_extract_candidates;

#[derive(thiserror::Error, Debug)]
pub enum SvelteFrameworkError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error(transparent)]
    Conventions(#[from] MacroConventionsError),
    #[error("{0}")]
    InvalidMacroUsage(LinguiAnalyzerDiagnostic),
    #[error("script element should have start tag")]
    MissingScriptStartTag,
    #[error(
        "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations."
    )]
    BareDirectTNotAllowed,
    #[error(
        "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
    )]
    BareDirectMacroRequiresReactiveOrEager { imported_name: Cow<'static, str> },
    #[error(
        "Module scripts in `.svelte` files must import Lingui macros from `@lingui/core/macro`, not `lingui-for-svelte/macro`."
    )]
    ModuleScriptMustUseCoreMacroPackage,
    #[error(
        "invalid virtual Trans child wrapper span: outer=({outer_start}, {outer_end}), inner=({inner_start}, {inner_end})"
    )]
    InvalidVirtualTransChildWrapperSpan {
        outer_start: usize,
        outer_end: usize,
        inner_start: usize,
        inner_end: usize,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteSemanticAnalysis {
    pub scripts: Vec<SvelteScriptBlock>,
    pub template_expressions: Vec<SvelteTemplateExpression>,
    pub template_components: Vec<SvelteTemplateComponent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteSourceMetadata {
    pub source_anchors: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptAnalysis {
    pub semantic: SvelteSemanticAnalysis,
    pub metadata: SvelteSourceMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptBlock {
    pub region: EmbeddedScriptRegion,
    pub is_module: bool,
    pub is_typescript: bool,
    pub declared_names: Vec<LeanString>,
    pub macro_imports: Vec<MacroImport>,
    pub macro_import_statement_spans: Vec<Span>,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteTemplateExpression {
    pub outer_span: Span,
    pub inner_span: Span,
    pub candidates: Vec<MacroCandidate>,
    pub shadowed_names: Vec<LeanString>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteTemplateComponent {
    pub candidate: MacroCandidate,
    pub shadowed_names: Vec<LeanString>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SvelteAdapter;

impl FrameworkAdapter for SvelteAdapter {
    type Analysis = SvelteScriptAnalysis;

    fn analyze(
        &self,
        source: &str,
        options: &AnalyzeOptions,
    ) -> Result<Self::Analysis, FrameworkError> {
        Ok(analyze_svelte(source, options)?)
    }
}

pub(crate) fn is_bare_direct_svelte_macro_forbidden(candidate: &MacroCandidate) -> bool {
    candidate.strategy == MacroCandidateStrategy::Standalone
        && candidate.flavor == MacroFlavor::Direct
        && matches!(
            candidate.imported_name.as_str(),
            "t" | "plural" | "select" | "selectOrdinal"
        )
}
