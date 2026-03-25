use serde::{Deserialize, Serialize};

use crate::AnalyzerError;
use crate::framework::astro::analyze_astro;

use super::super::{
    CommonCompilePlan, CompileTarget, CompileTargetContext, CompileTargetOutputKind,
    CompileTargetPrototype, CompileTranslationMode, FrameworkCompilePlan, RuntimeRequirements,
    build_compile_plan_for_framework,
};
use super::CommonFrameworkCompileAnalysis;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AstroCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
}

impl FrameworkCompilePlan for AstroCompilePlan {
    type Analysis = AstroFrameworkCompileAnalysis;

    fn analyze(source: &str) -> Result<Self::Analysis, AnalyzerError> {
        analyze_astro_compile(source)
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(_prototype: &CompileTargetPrototype, normalized_source: &str) -> String {
        normalized_source.to_string()
    }

    fn repair_compile_targets(_source: &str, _targets: &mut [CompileTarget]) {}

    fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
        compute_runtime_requirements(targets)
    }

    fn assemble_plan(
        common: CommonCompilePlan,
        runtime_requirements: RuntimeRequirements,
        _analysis: Self::Analysis,
    ) -> Self {
        Self {
            common,
            runtime_requirements,
        }
    }

    fn common(&self) -> &CommonCompilePlan {
        &self.common
    }
}

impl AstroCompilePlan {
    pub fn build(
        source: &str,
        source_name: &str,
        synthetic_name: &str,
    ) -> Result<Self, AnalyzerError> {
        build_compile_plan_for_framework::<Self>(source, source_name, synthetic_name)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AstroFrameworkCompileAnalysis {
    pub(crate) common: CommonFrameworkCompileAnalysis,
}

pub(crate) fn analyze_astro_compile(
    source: &str,
) -> Result<AstroFrameworkCompileAnalysis, AnalyzerError> {
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

    Ok(AstroFrameworkCompileAnalysis {
        common: CommonFrameworkCompileAnalysis {
            imports: analysis.macro_imports,
            prototypes,
            import_removals: Vec::new(),
            synthetic_lang: "ts".to_string(),
        },
    })
}

pub(crate) fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: !targets.is_empty(),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == CompileTargetOutputKind::Component),
    }
}
