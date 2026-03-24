use crate::{
    AnalyzerError,
    compile::{
        CompileTarget, CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype,
        CompileTranslationMode, RuntimeRequirements,
    },
    framework::astro::analyze_astro,
};

use super::{FrameworkCompileAdapter, FrameworkCompileAnalysis};

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct AstroCompileAdapter;

impl FrameworkCompileAdapter for AstroCompileAdapter {
    fn framework_name(&self) -> &'static str {
        "astro"
    }

    fn analyze_compile(&self, source: &str) -> Result<FrameworkCompileAnalysis, AnalyzerError> {
        let analysis = analyze_astro(source)?;
        let mut prototypes = Vec::new();

        prototypes.extend(
            analysis
                .frontmatter_candidates
                .iter()
                .cloned()
                .map(|candidate| CompileTargetPrototype {
                    output_kind: CompileTargetOutputKind::Expression,
                    candidate,
                    context: CompileTargetContext::Frontmatter,
                    translation_mode: CompileTranslationMode::Context,
                }),
        );
        for expression in &analysis.template_expressions {
            prototypes.extend(expression.candidates.iter().cloned().map(|candidate| {
                CompileTargetPrototype {
                    output_kind: CompileTargetOutputKind::Expression,
                    candidate,
                    context: CompileTargetContext::Template,
                    translation_mode: CompileTranslationMode::Context,
                }
            }));
        }
        prototypes.extend(
            analysis
                .template_components
                .iter()
                .cloned()
                .map(|component| CompileTargetPrototype {
                    output_kind: CompileTargetOutputKind::Component,
                    candidate: component.candidate,
                    context: CompileTargetContext::Template,
                    translation_mode: CompileTranslationMode::Context,
                }),
        );

        Ok(FrameworkCompileAnalysis {
            imports: analysis.macro_imports,
            prototypes,
            import_removals: Vec::new(),
            runtime_bindings: None,
            instance_script: None,
            module_script: None,
            synthetic_lang: "ts".to_string(),
        })
    }

    fn compute_runtime_requirements(&self, targets: &[CompileTarget]) -> RuntimeRequirements {
        RuntimeRequirements {
            needs_runtime_i18n_binding: !targets.is_empty(),
            needs_runtime_trans_component: targets
                .iter()
                .any(|target| target.output_kind == CompileTargetOutputKind::Component),
        }
    }
}
