mod analysis;
mod components;
mod validation;

use crate::common::{EmbeddedScriptRegion, Span};
use crate::framework::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, MacroCandidate, MacroImport,
};

pub use analysis::analyze_svelte;
pub(crate) use validation::bare_direct_macro_message;
pub use validation::{SvelteFrameworkError, validate_svelte_extract_candidates};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptAnalysis {
    pub scripts: Vec<SvelteScriptBlock>,
    pub template_expressions: Vec<SvelteTemplateExpression>,
    pub template_components: Vec<SvelteTemplateComponent>,
    pub source_anchors: Vec<usize>,
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
    use crate::framework::helpers::text::find_pattern_near_start;

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
