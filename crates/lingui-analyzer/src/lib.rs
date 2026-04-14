pub mod common;
pub mod conventions;
pub(crate) mod diagnostics;
pub mod extract;
pub mod framework;
pub mod syntax;
pub mod synthesis;
pub mod transform;

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::{Ts, Tsify};
use wasm_bindgen::JsError;
use wasm_bindgen::prelude::*;

use crate::conventions::FrameworkConventions;
use crate::extract::{ExtractError, build_synthetic_module, reinsert_transformed_declarations};
use crate::framework::astro::AstroAdapter;
use crate::framework::svelte::{SvelteAdapter, validate_svelte_extract_candidates};
use crate::framework::{AnalyzeOptions, FrameworkAdapter, FrameworkError};
use crate::synthesis::merge_owned_candidate_normalization_edits;
use crate::transform::{TransformError, finish_transform};

pub use conventions::FrameworkKind;
pub use extract::{
    ExtractTransformedProgram, ReinsertOptions, ReinsertedModule, SyntheticMapping,
    SyntheticModule, SyntheticModuleOptions,
};
pub use framework::{
    AstroWhitespaceMode, MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor,
    MacroImport, SvelteWhitespaceMode, WhitespaceMode,
};
pub use syntax::parse::ParseError;
pub use synthesis::NormalizedSegment;
pub use transform::{
    AstroTransformPlan, CommonTransformPlan, FinishedTransform, RuntimeRequirements,
    RuntimeWarningMode, RuntimeWarningOptions, SvelteTransformPlan, SvelteTransformRuntimeBindings,
    SvelteTransformScriptRegion, TransformReplacement, TransformTarget, TransformTargetContext,
    TransformTargetOutputKind, TransformTranslationMode, TransformedPrograms,
};

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"

type LeanString = string;

"#;

#[derive(thiserror::Error, Debug)]
pub enum AnalyzerError {
    #[error(transparent)]
    Framework(#[from] FrameworkError),
    #[error(transparent)]
    Extract(#[from] ExtractError),
    #[error(transparent)]
    Transform(#[from] TransformError),
}

pub fn build_synthetic_module_for_framework(
    source: &LeanString,
    source_name: &LeanString,
    synthetic_name: &LeanString,
    whitespace: Option<WhitespaceMode>,
    conventions: &FrameworkConventions,
) -> Result<SyntheticModule, AnalyzerError> {
    match conventions.framework {
        FrameworkKind::Astro => {
            let analysis = AstroAdapter.analyze(
                source,
                &AnalyzeOptions {
                    source_name: source_name.clone(),
                    whitespace: whitespace.unwrap_or(WhitespaceMode::Astro),
                    conventions: conventions.clone(),
                },
            )?;
            let mut candidates = analysis.semantic.frontmatter_candidates;
            candidates.extend(
                analysis
                    .semantic
                    .template_expressions
                    .into_iter()
                    .flat_map(|expression| expression.candidates),
            );
            candidates.extend(
                analysis
                    .semantic
                    .template_components
                    .into_iter()
                    .map(|component| component.candidate),
            );
            retain_standalone_candidates(&mut candidates);
            sort_candidates(&mut candidates);
            Ok(build_synthetic_module(
                source,
                source_name,
                synthetic_name,
                &analysis.semantic.macro_imports,
                &candidates,
                &analysis.metadata.source_anchors,
            )
            .map_err(ExtractError::from)?)
        }
        FrameworkKind::Svelte => {
            let analysis = SvelteAdapter.analyze(
                source,
                &AnalyzeOptions {
                    source_name: source_name.clone(),
                    whitespace: whitespace.unwrap_or(WhitespaceMode::Svelte),
                    conventions: conventions.clone(),
                },
            )?;
            let imports = analysis
                .semantic
                .scripts
                .iter()
                .flat_map(|script| script.macro_imports.iter().cloned())
                .collect::<Vec<_>>();
            let mut candidates = analysis
                .semantic
                .scripts
                .into_iter()
                .flat_map(|script| script.candidates)
                .collect::<Vec<_>>();
            candidates.extend(
                analysis
                    .semantic
                    .template_expressions
                    .into_iter()
                    .flat_map(|expression| expression.candidates),
            );
            candidates.extend(
                analysis
                    .semantic
                    .template_components
                    .into_iter()
                    .map(|component| component.candidate),
            );
            sort_candidates(&mut candidates);
            validate_svelte_extract_candidates(source_name, source, &candidates)
                .map_err(FrameworkError::from)?;
            retain_standalone_candidates(&mut candidates);
            Ok(build_synthetic_module(
                source,
                source_name,
                synthetic_name,
                &imports,
                &candidates,
                &analysis.metadata.source_anchors,
            )
            .map_err(ExtractError::from)?)
        }
    }
}

pub fn build_synthetic_module_for_astro(
    source: &LeanString,
    source_name: &LeanString,
    synthetic_name: &LeanString,
    whitespace: Option<AstroWhitespaceMode>,
    conventions: &FrameworkConventions,
) -> Result<SyntheticModule, AnalyzerError> {
    build_synthetic_module_for_framework(
        source,
        source_name,
        synthetic_name,
        whitespace.map(WhitespaceMode::from),
        conventions,
    )
}

pub fn build_synthetic_module_for_svelte(
    source: &LeanString,
    source_name: &LeanString,
    synthetic_name: &LeanString,
    whitespace: Option<SvelteWhitespaceMode>,
    conventions: &FrameworkConventions,
) -> Result<SyntheticModule, AnalyzerError> {
    build_synthetic_module_for_framework(
        source,
        source_name,
        synthetic_name,
        whitespace.map(WhitespaceMode::from),
        conventions,
    )
}

fn sort_candidates(candidates: &mut [MacroCandidate]) {
    candidates.sort_by_key(|candidate| (candidate.outer_span.start, candidate.outer_span.end));
}

fn retain_standalone_candidates(candidates: &mut Vec<MacroCandidate>) {
    merge_owned_candidate_normalization_edits(candidates);
    candidates.retain(|candidate| candidate.strategy == MacroCandidateStrategy::Standalone);
}

pub fn build_svelte_transform_plan(
    options: &TransformPlanOptions,
) -> Result<SvelteTransformPlan, TransformError> {
    SvelteTransformPlan::build(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic-transform.tsx")),
        options.whitespace.unwrap_or(WhitespaceMode::Svelte),
        options.conventions.clone(),
        options.runtime_warnings.clone().unwrap_or_default(),
    )
}

pub fn build_svelte_transform_plan_for_wasm(
    options: &SvelteTransformPlanOptions,
) -> Result<SvelteTransformPlan, TransformError> {
    SvelteTransformPlan::build(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic-transform.tsx")),
        options
            .whitespace
            .map(WhitespaceMode::from)
            .unwrap_or(WhitespaceMode::Svelte),
        options.conventions.clone(),
        options.runtime_warnings.clone().unwrap_or_default(),
    )
}

pub fn build_astro_transform_plan(
    options: &TransformPlanOptions,
) -> Result<AstroTransformPlan, TransformError> {
    AstroTransformPlan::build(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic-transform.tsx")),
        options.whitespace.unwrap_or(WhitespaceMode::Astro),
        options.conventions.clone(),
        options.runtime_warnings.clone().unwrap_or_default(),
    )
}

pub fn build_astro_transform_plan_for_wasm(
    options: &AstroTransformPlanOptions,
) -> Result<AstroTransformPlan, TransformError> {
    AstroTransformPlan::build(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic-transform.tsx")),
        options
            .whitespace
            .map(WhitespaceMode::from)
            .unwrap_or(WhitespaceMode::Astro),
        options.conventions.clone(),
        options.runtime_warnings.clone().unwrap_or_default(),
    )
}

pub fn finish_svelte_transform(
    options: &SvelteFinishTransformOptions,
) -> Result<FinishedTransform, TransformError> {
    Ok(finish_transform(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )
    .map_err(TransformError::Lower)?
    .into_public())
}

pub fn finish_astro_transform(
    options: &AstroFinishTransformOptions,
) -> Result<FinishedTransform, TransformError> {
    Ok(finish_transform(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )
    .map_err(TransformError::Lower)?
    .into_public())
}

#[wasm_bindgen(js_name = "buildSyntheticModule")]
pub fn wasm_build_synthetic_module(
    options: Ts<SyntheticModuleOptions>,
) -> Result<Ts<SyntheticModule>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_synthetic_module_for_framework(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic.js")),
        options.whitespace,
        &options.conventions,
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "buildAstroSyntheticModule")]
pub fn wasm_build_astro_synthetic_module(
    options: Ts<AstroSyntheticModuleOptions>,
) -> Result<Ts<SyntheticModule>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_synthetic_module_for_astro(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic.js")),
        options.whitespace,
        &options.conventions,
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "buildSvelteSyntheticModule")]
pub fn wasm_build_svelte_synthetic_module(
    options: Ts<SvelteSyntheticModuleOptions>,
) -> Result<Ts<SyntheticModule>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_synthetic_module_for_svelte(
        &options.source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        options
            .synthetic_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("synthetic.js")),
        options.whitespace,
        &options.conventions,
    )?;
    Ok(result.into_ts()?)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct TransformPlanOptions {
    pub source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_name: Option<LeanString>,
    pub whitespace: Option<WhitespaceMode>,
    pub runtime_warnings: Option<RuntimeWarningOptions>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroTransformPlanOptions {
    pub source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_name: Option<LeanString>,
    pub whitespace: Option<AstroWhitespaceMode>,
    pub runtime_warnings: Option<RuntimeWarningOptions>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteTransformPlanOptions {
    pub source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_name: Option<LeanString>,
    pub whitespace: Option<SvelteWhitespaceMode>,
    pub runtime_warnings: Option<RuntimeWarningOptions>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroSyntheticModuleOptions {
    pub source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_name: Option<LeanString>,
    pub whitespace: Option<AstroWhitespaceMode>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteSyntheticModuleOptions {
    pub source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_name: Option<LeanString>,
    pub whitespace: Option<SvelteWhitespaceMode>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteFinishTransformOptions {
    pub plan: SvelteTransformPlan,
    pub source: LeanString,
    pub transformed_programs: TransformedPrograms,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroFinishTransformOptions {
    pub plan: AstroTransformPlan,
    pub source: LeanString,
    pub transformed_programs: TransformedPrograms,
}

#[wasm_bindgen(js_name = "buildSvelteTransformPlan")]
pub fn wasm_build_svelte_transform_plan(
    options: Ts<SvelteTransformPlanOptions>,
) -> Result<Ts<SvelteTransformPlan>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_svelte_transform_plan_for_wasm(&options)?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "reinsertTransformedDeclarations")]
pub fn wasm_reinsert_transformed_declarations(
    options: Ts<ReinsertOptions>,
) -> Result<Ts<ReinsertedModule>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = reinsert_transformed_declarations(
        &options.original_source,
        options
            .source_name
            .as_ref()
            .unwrap_or(&LeanString::from_static_str("source")),
        &options.synthetic_module,
        &options.transformed_program,
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "buildAstroTransformPlan")]
pub fn wasm_build_astro_transform_plan(
    options: Ts<AstroTransformPlanOptions>,
) -> Result<Ts<AstroTransformPlan>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_astro_transform_plan_for_wasm(&options)?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "finishSvelteTransform")]
pub fn wasm_finish_svelte_transform(
    options: Ts<SvelteFinishTransformOptions>,
) -> Result<Ts<FinishedTransform>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = finish_svelte_transform(&options)?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "finishAstroTransform")]
pub fn wasm_finish_astro_transform(
    options: Ts<AstroFinishTransformOptions>,
) -> Result<Ts<FinishedTransform>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = finish_astro_transform(&options)?;
    Ok(result.into_ts()?)
}
