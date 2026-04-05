mod analysis;
mod injection;
mod runtime;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{MappedTextError, RenderedMappedText, Span};
use crate::compile::{
    CommonCompilePlan, CompileError, CompileReplacementInternal, CompileTarget,
    CompileTargetPrototype, FrameworkCompilePlan, RuntimeComponentError, RuntimeRequirements,
    RuntimeWarningOptions, build_compile_plan_for_framework,
};
use crate::conventions::FrameworkConventions;
use crate::framework::{AstroFrameworkError, FrameworkError, JsAnalysisError, WhitespaceMode};
use crate::syntax::parse::ParseError;

use super::{AdapterError, CommonFrameworkCompileAnalysis};

use analysis::{analyze_astro_compile, compute_runtime_requirements};
use injection::append_runtime_injection_replacements;
use runtime::lower_runtime_component_markup;

#[derive(thiserror::Error, Debug)]
pub enum AstroAdapterError {
    #[error(transparent)]
    Framework(#[from] FrameworkError),
    #[error(transparent)]
    AstroFramework(#[from] AstroFrameworkError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
    #[error(transparent)]
    RuntimeComponent(#[from] RuntimeComponentError),
    #[error("missing Astro convention field: {0}")]
    MissingConvention(&'static str),
    #[error("missing original Astro Trans node for runtime component lowering")]
    MissingOriginalAstroTransNode,
    #[error("missing tag name while lowering Astro slot callback")]
    MissingTagNameWhileLoweringAstroSlotCallback,
    #[error("invalid original Astro span while lowering source map: {start}..{end}")]
    InvalidOriginalSpanWhileLoweringAstroSourceMap { start: usize, end: usize },
    #[error("mismatched Astro runtime component placeholders: expected {expected}, found {found}")]
    MismatchedAstroRuntimeComponentPlaceholderCount { expected: usize, found: usize },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_warnings: RuntimeWarningOptions,
    pub runtime_bindings: AstroCompileRuntimeBindings,
    pub frontmatter: Option<AstroCompileFrontmatterRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroCompileRuntimeBindings {
    pub create_i18n: String,
    pub i18n: String,
    pub runtime_trans: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroCompileFrontmatterRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub prelude_insert_point: usize,
    pub trailing_whitespace_range: Option<Span>,
    pub has_remaining_content_after_import_removal: bool,
}

impl FrameworkCompilePlan for AstroCompilePlan {
    type Analysis = AstroFrameworkCompileAnalysis;

    fn analyze(
        source: &str,
        source_name: &str,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, CompileError> {
        Ok(
            analyze_astro_compile(source, source_name, whitespace_mode, conventions)
                .map_err(AdapterError::from)?,
        )
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(
        _analysis: &Self::Analysis,
        _prototype: &CompileTargetPrototype,
        normalized_source: &RenderedMappedText,
    ) -> Result<RenderedMappedText, CompileError> {
        Ok(RenderedMappedText {
            code: normalized_source.code.clone(),
            indexed_source_map: None,
        })
    }

    fn repair_compile_targets(_source: &str, _targets: &mut [CompileTarget]) {}

    fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
        compute_runtime_requirements(targets)
    }

    fn assemble_plan(
        common: CommonCompilePlan,
        runtime_requirements: RuntimeRequirements,
        runtime_warnings: RuntimeWarningOptions,
        analysis: Self::Analysis,
    ) -> Self {
        Self {
            common,
            runtime_requirements,
            runtime_warnings,
            runtime_bindings: analysis.runtime_bindings,
            frontmatter: analysis.frontmatter,
        }
    }

    fn common(&self) -> &CommonCompilePlan {
        &self.common
    }

    fn lower_runtime_component_markup(
        &self,
        source_name: &str,
        source: &str,
        target: &CompileTarget,
        declaration: &RenderedMappedText,
    ) -> Result<RenderedMappedText, AdapterError> {
        lower_runtime_component_markup(
            source_name,
            source,
            target,
            declaration,
            self.runtime_bindings.runtime_trans.as_str(),
            self.runtime_warnings.trans_content_override,
        )
        .map_err(AdapterError::from)
    }

    fn append_runtime_injection_replacements(
        &self,
        source: &str,
        replacements: &mut Vec<CompileReplacementInternal>,
    ) -> Result<(), AdapterError> {
        append_runtime_injection_replacements(self, source, replacements)
            .map_err(AdapterError::from)
    }
}

impl AstroCompilePlan {
    pub fn build(
        source: &str,
        source_name: &str,
        synthetic_name: &str,
        whitespace_mode: WhitespaceMode,
        conventions: FrameworkConventions,
        runtime_warnings: RuntimeWarningOptions,
    ) -> Result<Self, CompileError> {
        build_compile_plan_for_framework::<Self>(
            source,
            source_name,
            synthetic_name,
            whitespace_mode,
            conventions,
            runtime_warnings,
        )
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AstroFrameworkCompileAnalysis {
    pub(crate) common: CommonFrameworkCompileAnalysis,
    pub(crate) runtime_bindings: AstroCompileRuntimeBindings,
    pub(crate) frontmatter: Option<AstroCompileFrontmatterRegion>,
}
