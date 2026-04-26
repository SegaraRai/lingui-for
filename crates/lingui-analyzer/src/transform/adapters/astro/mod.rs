mod analysis;
mod injection;
mod runtime;

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{MappedTextError, RenderedMappedText, Span};
use crate::conventions::FrameworkConventions;
use crate::framework::{AstroFrameworkError, FrameworkError, JsAnalysisError, WhitespaceMode};
use crate::syntax::parse::ParseError;
use crate::transform::{
    CommonTransformPlan, FrameworkTransformPlan, RuntimeComponentError, RuntimeRequirements,
    RuntimeWarningOptions, TransformError, TransformReplacementInternal, TransformTarget,
    TransformTargetPrototype, build_transform_plan_for_framework,
};

use super::{AdapterError, CommonFrameworkTransformAnalysis};

use analysis::{analyze_astro_transform, compute_runtime_requirements};
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
    #[error(
        "ambiguous Astro runtime component wrapper match: expected placeholder kinds {expected}, candidates {candidates}"
    )]
    AmbiguousAstroRuntimeComponentWrapperMatch {
        expected: LeanString,
        candidates: LeanString,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroTransformPlan {
    pub common: CommonTransformPlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_warnings: RuntimeWarningOptions,
    pub runtime_bindings: AstroTransformRuntimeBindings,
    pub frontmatter: Option<AstroTransformFrontmatterRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroTransformRuntimeBindings {
    pub create_i18n: LeanString,
    pub i18n: LeanString,
    pub runtime_trans: LeanString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroTransformFrontmatterRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub prelude_insert_point: usize,
    pub trailing_whitespace_range: Option<Span>,
    pub has_remaining_content_after_import_removal: bool,
}

impl FrameworkTransformPlan for AstroTransformPlan {
    type Analysis = AstroFrameworkTransformAnalysis;

    fn analyze(
        source: &LeanString,
        source_name: &LeanString,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, TransformError> {
        Ok(
            analyze_astro_transform(source, source_name, whitespace_mode, conventions)
                .map_err(AdapterError::from)?,
        )
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkTransformAnalysis {
        &mut analysis.common
    }

    fn wrap_transform_source(
        _analysis: &Self::Analysis,
        _prototype: &TransformTargetPrototype,
        normalized_source: &RenderedMappedText,
    ) -> Result<RenderedMappedText, TransformError> {
        Ok(RenderedMappedText {
            code: normalized_source.code.clone(),
            indexed_source_map: None,
        })
    }

    fn compute_runtime_requirements(targets: &[TransformTarget]) -> RuntimeRequirements {
        compute_runtime_requirements(targets)
    }

    fn assemble_plan(
        common: CommonTransformPlan,
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

    fn common(&self) -> &CommonTransformPlan {
        &self.common
    }

    fn lower_runtime_component_markup(
        &self,
        source_name: &LeanString,
        source: &LeanString,
        target: &TransformTarget,
        declaration: &RenderedMappedText,
    ) -> Result<RenderedMappedText, AdapterError> {
        lower_runtime_component_markup(
            source_name,
            source,
            target,
            declaration,
            self.runtime_bindings.runtime_trans.clone(),
            self.runtime_warnings.trans_content_override,
        )
        .map_err(AdapterError::from)
    }

    fn append_runtime_injection_replacements(
        &self,
        source: &LeanString,
        replacements: &mut Vec<TransformReplacementInternal>,
    ) -> Result<(), AdapterError> {
        append_runtime_injection_replacements(self, source, replacements)
            .map_err(AdapterError::from)
    }
}

impl AstroTransformPlan {
    pub fn build(
        source: &LeanString,
        source_name: &LeanString,
        synthetic_name: &LeanString,
        whitespace_mode: WhitespaceMode,
        conventions: FrameworkConventions,
        runtime_warnings: RuntimeWarningOptions,
    ) -> Result<Self, TransformError> {
        build_transform_plan_for_framework::<Self>(
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
pub(crate) struct AstroFrameworkTransformAnalysis {
    pub(crate) common: CommonFrameworkTransformAnalysis,
    pub(crate) runtime_bindings: AstroTransformRuntimeBindings,
    pub(crate) frontmatter: Option<AstroTransformFrontmatterRegion>,
}
