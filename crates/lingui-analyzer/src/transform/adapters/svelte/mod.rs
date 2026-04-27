mod analysis;
mod injection;
mod runtime;

use std::borrow::Cow;

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{InvalidSourceSpan, MappedTextError, RenderedMappedText, ScriptLang, Span};
use crate::conventions::FrameworkConventions;
use crate::diagnostics::LinguiAnalyzerDiagnostic;
use crate::diagnostics::svelte::bare_direct_macro_usage;
use crate::framework::svelte::is_bare_direct_svelte_macro_forbidden;
use crate::framework::{FrameworkError, SvelteFrameworkError, WhitespaceMode};
use crate::syntax::parse::ParseError;
use crate::transform::{
    CommonTransformPlan, FrameworkTransformPlan, RuntimeComponentError, RuntimeRequirements,
    RuntimeWarningOptions, TransformError, TransformReplacementInternal, TransformTarget,
    TransformTargetContext, TransformTargetOutputKind, TransformTargetPrototype,
    build_transform_plan_for_framework,
};

use super::{AdapterError, CommonFrameworkTransformAnalysis};

use analysis::{analyze_svelte_transform, compute_runtime_requirements, wrap_transform_source};
use injection::append_runtime_injection_replacements;
use runtime::lower_runtime_component_markup;

#[derive(thiserror::Error, Debug)]
pub enum SvelteAdapterError {
    #[error(transparent)]
    Framework(#[from] FrameworkError),
    #[error(transparent)]
    SvelteFramework(#[from] SvelteFrameworkError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
    #[error(transparent)]
    InvalidSourceSpan(#[from] InvalidSourceSpan),
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    RuntimeComponent(#[from] RuntimeComponentError),
    #[error("{0}")]
    InvalidMacroUsage(LinguiAnalyzerDiagnostic),
    #[error(
        "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations."
    )]
    BareDirectTNotAllowed,
    #[error(
        "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
    )]
    BareDirectMacroRequiresReactiveOrEager { imported_name: Cow<'static, str> },
    #[error("missing Svelte convention field: {0}")]
    MissingConvention(&'static str),
    #[error("missing original Svelte Trans node for runtime component lowering")]
    MissingOriginalSvelteTransNode,
    #[error("missing tag name while lowering Svelte snippet")]
    MissingTagNameWhileLoweringSvelteSnippet,
    #[error("mismatched Svelte runtime component placeholders: expected {expected}, found {found}")]
    MismatchedSvelteRuntimeComponentPlaceholderCount { expected: usize, found: usize },
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteTransformRuntimeBindings {
    pub create_lingui_accessors: LeanString,
    pub context: LeanString,
    pub get_i18n: LeanString,
    pub translate: LeanString,
    pub reactive_translation_wrapper: LeanString,
    pub eager_translation_wrapper: LeanString,
    pub trans_component: LeanString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteTransformScriptRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub lang: ScriptLang,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteTransformPlan {
    pub common: CommonTransformPlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_warnings: RuntimeWarningOptions,
    pub runtime_bindings: SvelteTransformRuntimeBindings,
    pub instance_script: Option<SvelteTransformScriptRegion>,
    pub module_script: Option<SvelteTransformScriptRegion>,
}

impl FrameworkTransformPlan for SvelteTransformPlan {
    type Analysis = SvelteFrameworkTransformAnalysis;

    fn analyze(
        source: &LeanString,
        source_name: &LeanString,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, TransformError> {
        Ok(
            analyze_svelte_transform(source, source_name, whitespace_mode, conventions)
                .map_err(AdapterError::from)?,
        )
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkTransformAnalysis {
        &mut analysis.common
    }

    fn wrap_transform_source(
        analysis: &Self::Analysis,
        prototype: &TransformTargetPrototype,
        normalized_source: &RenderedMappedText,
    ) -> Result<RenderedMappedText, TransformError> {
        wrap_transform_source(analysis, prototype, normalized_source)
            .map_err(AdapterError::from)
            .map_err(TransformError::from)
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
            instance_script: analysis.instance_script,
            module_script: analysis.module_script,
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
            self.runtime_bindings.trans_component.as_str(),
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

impl SvelteTransformPlan {
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
pub(crate) struct SvelteFrameworkTransformAnalysis {
    pub(crate) common: CommonFrameworkTransformAnalysis,
    pub(crate) runtime_bindings: SvelteTransformRuntimeBindings,
    pub(crate) instance_script: Option<SvelteTransformScriptRegion>,
    pub(crate) module_script: Option<SvelteTransformScriptRegion>,
}

pub(crate) fn validate_transform_targets(
    source_name: &str,
    source: &str,
    prototypes: &[TransformTargetPrototype],
) -> Result<(), SvelteAdapterError> {
    let offending_candidate = prototypes.iter().find_map(|prototype| {
        (matches!(prototype.context, TransformTargetContext::InstanceScript)
            && prototype.output_kind == TransformTargetOutputKind::Expression
            && is_bare_direct_svelte_macro_forbidden(&prototype.candidate))
        .then_some(&prototype.candidate)
    });

    if let Some(candidate) = offending_candidate {
        return Err(SvelteAdapterError::InvalidMacroUsage(
            bare_direct_macro_usage(
                source,
                source_name,
                candidate.outer_span,
                candidate.imported_name.as_str(),
            ),
        ));
    }

    Ok(())
}
