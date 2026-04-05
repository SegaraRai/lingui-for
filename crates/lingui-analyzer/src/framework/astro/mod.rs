mod analysis;
mod components;
pub mod ir;
mod validation;

use crate::common::{EmbeddedScriptRegion, Span};
use crate::framework::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, MacroCandidate, MacroImport,
};

pub use analysis::analyze_astro;
pub use validation::AstroFrameworkError;

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
    pub shadowed_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroFrontmatterAnalysis {
    pub frontmatter: Option<EmbeddedScriptRegion>,
    pub macro_imports: Vec<MacroImport>,
    pub frontmatter_declared_names: Vec<String>,
    pub frontmatter_import_statement_spans: Vec<Span>,
    pub frontmatter_candidates: Vec<MacroCandidate>,
    pub template_expressions: Vec<AstroTemplateExpression>,
    pub template_components: Vec<AstroTemplateComponent>,
    pub source_anchors: Vec<usize>,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::analyze_astro;
    use crate::conventions::{
        FrameworkConventions, FrameworkKind, MacroConventions, MacroPackage, MacroPackageKind,
        RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions,
    };
    use crate::framework::{AnalyzeOptions, WhitespaceMode};

    fn test_conventions() -> FrameworkConventions {
        FrameworkConventions {
            framework: FrameworkKind::Astro,
            macro_: MacroConventions {
                packages: BTreeMap::from([
                    (
                        MacroPackageKind::Core,
                        MacroPackage {
                            packages: vec!["@lingui/core/macro".to_string()],
                        },
                    ),
                    (
                        MacroPackageKind::Astro,
                        MacroPackage {
                            packages: vec!["lingui-for-astro/macro".to_string()],
                        },
                    ),
                ]),
            },
            runtime: RuntimeConventions {
                package: "lingui-for-astro/runtime".to_string(),
                exports: RuntimeExportConventions {
                    trans: "RuntimeTrans".to_string(),
                    i18n_accessor: None,
                },
            },
            bindings: RuntimeBindingSeeds {
                i18n_accessor_factory: None,
                context: None,
                get_i18n: None,
                translate: None,
                i18n_instance: None,
                runtime_trans_component: "RuntimeTrans".to_string(),
            },
            synthetic: None,
            wrappers: None,
        }
    }

    #[test]
    fn analyzes_macros_inside_html_interpolation_via_astro_ir() {
        let source = r#"---
import { t as translate } from "@lingui/core/macro";
const name = "Ada";
const ready = true;
---
{ready ? <strong>{translate`Hello ${name}`}</strong> : null}
"#;

        let analysis = analyze_astro(
            source,
            &AnalyzeOptions {
                source_name: "Component.astro".to_string(),
                whitespace: WhitespaceMode::Astro,
                conventions: test_conventions(),
            },
        )
        .expect("analysis succeeds");

        let expression = analysis
            .template_expressions
            .iter()
            .find(|expression| {
                source[expression.outer_span.start..expression.outer_span.end].starts_with('{')
            })
            .expect("html interpolation expression exists");

        assert_eq!(expression.candidates.len(), 1);
        assert_eq!(expression.candidates[0].imported_name, "t");
    }
}
