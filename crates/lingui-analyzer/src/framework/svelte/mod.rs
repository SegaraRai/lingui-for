mod analysis;
mod components;
mod validation;

use std::borrow::Cow;

use crate::common::{EmbeddedScriptRegion, Span};
use crate::conventions::MacroConventionsError;
use crate::diagnostics::LinguiAnalyzerDiagnostic;

use super::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, JsAnalysisError, MacroCandidate, MacroImport,
    ParseError,
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
    pub declared_names: Vec<String>,
    pub macro_imports: Vec<MacroImport>,
    pub macro_import_statement_spans: Vec<Span>,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteTemplateExpression {
    pub outer_span: Span,
    pub inner_span: Span,
    pub candidates: Vec<MacroCandidate>,
    pub shadowed_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteTemplateComponent {
    pub candidate: MacroCandidate,
    pub shadowed_names: Vec<String>,
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

#[cfg(test)]
mod tests {
    use crate::common::find_pattern_near_start;

    #[test]
    fn finds_svelte_prefix_near_unicode_without_splitting_multibyte_text() {
        let source = "<p>前置き🎌 {$t`家族👨‍👩‍👧‍👦😀😃😄 ${name}`} 後置き🍣</p>";
        let current_start = source.find("t`").expect("template starts at t");
        let current_end = source
            .find("}`")
            .map(|index| index + 2)
            .unwrap_or(source.len());

        let start = find_pattern_near_start(source, current_start, current_end, "$t")
            .expect("finds reactive prefix");

        assert_eq!(&source[start..start + 2], "$t");
        assert!(source.is_char_boundary(start));
    }
}
