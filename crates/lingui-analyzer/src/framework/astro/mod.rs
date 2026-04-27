mod analysis;
pub(crate) mod components;
pub mod ir;
pub(crate) mod markup;
mod validation;

use lean_string::LeanString;

use crate::common::{EmbeddedScriptRegion, Span};
use crate::diagnostics::LinguiAnalyzerDiagnostic;

use super::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, JsAnalysisError, MacroCandidate, MacroImport,
    ParseError,
};

pub use analysis::analyze_astro;

use ir::AstroIrError;

#[derive(thiserror::Error, Debug)]
pub enum AstroFrameworkError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error(transparent)]
    Ir(#[from] AstroIrError),
    #[error("missing bundled Astro html interpolation root for declaration `{declaration_id}`")]
    MissingBundledExpressionRoot { declaration_id: LeanString },
    #[error("{0}")]
    InvalidMacroUsage(LinguiAnalyzerDiagnostic),
}

#[derive(Debug, Default, Clone, Copy)]
pub struct AstroAdapter;

impl FrameworkAdapter for AstroAdapter {
    type Analysis = AstroFrontmatterAnalysis;

    fn analyze(
        &self,
        source: &str,
        options: &AnalyzeOptions,
    ) -> Result<Self::Analysis, FrameworkError> {
        Ok(analyze_astro(source, options)?)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroTemplateExpression {
    pub outer_span: Span,
    pub inner_span: Span,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroTemplateComponent {
    pub candidate: MacroCandidate,
    pub shadowed_names: Vec<LeanString>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroSemanticAnalysis {
    pub macro_imports: Vec<MacroImport>,
    pub frontmatter_declared_names: Vec<LeanString>,
    pub frontmatter_candidates: Vec<MacroCandidate>,
    pub template_expressions: Vec<AstroTemplateExpression>,
    pub template_components: Vec<AstroTemplateComponent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroSourceMetadata {
    pub frontmatter: Option<EmbeddedScriptRegion>,
    pub frontmatter_import_statement_spans: Vec<Span>,
    pub source_anchors: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroFrontmatterAnalysis {
    pub semantic: AstroSemanticAnalysis,
    pub metadata: AstroSourceMetadata,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use indoc::indoc;
    use lean_string::LeanString;

    use crate::common::span_text;
    use crate::conventions::{
        FrameworkConventions, FrameworkKind, MacroConventions, MacroPackage, MacroPackageKind,
        RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions,
    };
    use crate::framework::{AnalyzeOptions, WhitespaceMode};

    use super::analyze_astro;

    fn ls(text: &str) -> LeanString {
        LeanString::from(text)
    }

    fn test_conventions() -> FrameworkConventions {
        FrameworkConventions {
            framework: FrameworkKind::Astro,
            macro_: MacroConventions {
                packages: BTreeMap::from([
                    (
                        MacroPackageKind::Core,
                        MacroPackage {
                            packages: vec![ls("@lingui/core/macro")],
                        },
                    ),
                    (
                        MacroPackageKind::Astro,
                        MacroPackage {
                            packages: vec![ls("lingui-for-astro/macro")],
                        },
                    ),
                ]),
            },
            runtime: RuntimeConventions {
                package: ls("lingui-for-astro/runtime"),
                exports: RuntimeExportConventions {
                    trans: ls("RuntimeTrans"),
                    i18n_accessor: None,
                },
            },
            bindings: RuntimeBindingSeeds {
                i18n_accessor_factory: None,
                context: None,
                get_i18n: None,
                translate: None,
                i18n_instance: None,
                reactive_translation_wrapper: None,
                eager_translation_wrapper: None,
                runtime_trans_component: ls("RuntimeTrans"),
            },
        }
    }

    #[test]
    fn analyzes_macros_inside_html_interpolation_via_astro_ir() {
        let source = indoc! {r#"
            ---
            import { t as translate } from "@lingui/core/macro";
            const name = "Ada";
            const ready = true;
            ---
            {ready ? <strong>{translate`Hello ${name}`}</strong> : null}
        "#};

        let analysis = analyze_astro(
            source,
            &AnalyzeOptions {
                source_name: ls("Component.astro"),
                whitespace: WhitespaceMode::Astro,
                conventions: test_conventions(),
            },
        )
        .expect("analysis succeeds");

        let expression = analysis
            .semantic
            .template_expressions
            .iter()
            .find(|expression| span_text(source, expression.outer_span).starts_with('{'))
            .expect("html interpolation expression exists");

        assert_eq!(expression.candidates.len(), 1);
        assert_eq!(expression.candidates[0].imported_name, "t");
    }
}
