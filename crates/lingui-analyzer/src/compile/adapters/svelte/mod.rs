mod analysis;
mod injection;
mod runtime;

use std::borrow::Cow;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{
    MappedTextError, RenderedMappedText, ScriptLang, Span, format_single_diagnostic,
    make_diagnostic,
};
use crate::compile::{
    CommonCompilePlan, CompileError, CompileReplacementInternal, CompileTarget,
    CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype, FrameworkCompilePlan,
    RuntimeComponentError, RuntimeRequirements, build_compile_plan_for_framework,
};
use crate::conventions::FrameworkConventions;
use crate::framework::svelte::bare_direct_macro_message;
use crate::framework::{
    FrameworkError, MacroCandidate, MacroCandidateStrategy, MacroFlavor, ParseError,
    SvelteFrameworkError, WhitespaceMode,
};

use super::{AdapterError, CommonFrameworkCompileAnalysis};

use analysis::{
    analyze_svelte_compile, compute_runtime_requirements, repair_compile_targets,
    wrap_compile_source,
};
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
    Parse(#[from] ParseError),
    #[error(transparent)]
    RuntimeComponent(#[from] RuntimeComponentError),
    #[error("{0}")]
    InvalidMacroUsage(String),
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
pub struct SvelteCompileRuntimeBindings {
    pub create_lingui_accessors: String,
    pub context: String,
    pub get_i18n: String,
    pub translate: String,
    pub trans_component: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteCompileScriptRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub lang: ScriptLang,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_bindings: SvelteCompileRuntimeBindings,
    pub instance_script: Option<SvelteCompileScriptRegion>,
    pub module_script: Option<SvelteCompileScriptRegion>,
}

impl FrameworkCompilePlan for SvelteCompilePlan {
    type Analysis = SvelteFrameworkCompileAnalysis;

    fn analyze(
        source: &str,
        source_name: &str,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, CompileError> {
        Ok(
            analyze_svelte_compile(source, source_name, whitespace_mode, conventions)
                .map_err(AdapterError::from)?,
        )
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(
        analysis: &Self::Analysis,
        prototype: &CompileTargetPrototype,
        normalized_source: &str,
    ) -> Result<RenderedMappedText, CompileError> {
        wrap_compile_source(analysis, prototype, normalized_source)
            .map_err(AdapterError::from)
            .map_err(CompileError::from)
    }

    fn repair_compile_targets(source: &str, targets: &mut [CompileTarget]) {
        repair_compile_targets(source, targets);
    }

    fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
        compute_runtime_requirements(targets)
    }

    fn assemble_plan(
        common: CommonCompilePlan,
        runtime_requirements: RuntimeRequirements,
        analysis: Self::Analysis,
    ) -> Self {
        Self {
            common,
            runtime_requirements,
            runtime_bindings: analysis.runtime_bindings,
            instance_script: analysis.instance_script,
            module_script: analysis.module_script,
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
            self.runtime_bindings.trans_component.as_str(),
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

impl SvelteCompilePlan {
    pub fn build(
        source: &str,
        source_name: &str,
        synthetic_name: &str,
        whitespace_mode: WhitespaceMode,
        conventions: FrameworkConventions,
    ) -> Result<Self, CompileError> {
        build_compile_plan_for_framework::<Self>(
            source,
            source_name,
            synthetic_name,
            whitespace_mode,
            conventions,
        )
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SvelteFrameworkCompileAnalysis {
    pub(crate) common: CommonFrameworkCompileAnalysis,
    pub(crate) conventions: FrameworkConventions,
    pub(crate) runtime_bindings: SvelteCompileRuntimeBindings,
    pub(crate) instance_script: Option<SvelteCompileScriptRegion>,
    pub(crate) module_script: Option<SvelteCompileScriptRegion>,
}

pub(crate) fn validate_compile_targets(
    source_name: &str,
    source: &str,
    prototypes: &[CompileTargetPrototype],
) -> Result<(), SvelteAdapterError> {
    let offending_candidate = prototypes.iter().find_map(|prototype| {
        (matches!(prototype.context, CompileTargetContext::InstanceScript)
            && prototype.output_kind == CompileTargetOutputKind::Expression
            && is_forbidden_bare_direct_svelte_macro(&prototype.candidate))
        .then_some(&prototype.candidate)
    });

    if let Some(candidate) = offending_candidate {
        return Err(SvelteAdapterError::InvalidMacroUsage(
            format_single_diagnostic(
                source,
                &make_diagnostic(
                    source_name,
                    candidate.outer_span,
                    bare_direct_macro_message(candidate.imported_name.as_str()),
                ),
            ),
        ));
    }

    Ok(())
}

fn is_forbidden_bare_direct_svelte_macro(candidate: &MacroCandidate) -> bool {
    candidate.strategy == MacroCandidateStrategy::Standalone
        && candidate.flavor == MacroFlavor::Direct
        && matches!(
            candidate.imported_name.as_str(),
            "t" | "plural" | "select" | "selectOrdinal"
        )
}
