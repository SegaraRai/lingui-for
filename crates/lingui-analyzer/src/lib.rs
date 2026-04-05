pub mod common;
pub mod compile;
pub mod conventions;
pub(crate) mod diagnostics;
pub mod extract;
pub mod framework;
pub mod syntax;
pub mod synthesis;

use serde::{Deserialize, Serialize};
use tsify::{Ts, Tsify};
use wasm_bindgen::JsError;
use wasm_bindgen::prelude::*;

use crate::compile::{CompileError, finish_compile};
use crate::conventions::FrameworkConventions;
use crate::extract::{ExtractError, build_synthetic_module, reinsert_transformed_declarations};
use crate::framework::astro::AstroAdapter;
use crate::framework::svelte::{SvelteAdapter, validate_svelte_extract_candidates};
use crate::framework::{AnalyzeOptions, FrameworkAdapter, FrameworkError};
use crate::synthesis::merge_owned_candidate_normalization_edits;

pub use compile::{
    AstroCompilePlan, CommonCompilePlan, CompileReplacement, CompileTarget, CompileTargetContext,
    CompileTargetOutputKind, CompileTranslationMode, FinishedCompile, RuntimeRequirements,
    RuntimeWarningMode, RuntimeWarningOptions, SvelteCompilePlan, SvelteCompileRuntimeBindings,
    SvelteCompileScriptRegion, TransformedPrograms,
};
pub use conventions::FrameworkKind;
pub use extract::{
    ExtractTransformedProgram, ReinsertOptions, ReinsertedModule, SyntheticMapping,
    SyntheticModule, SyntheticModuleOptions,
};
pub use framework::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
    WhitespaceMode,
};
pub use syntax::parse::ParseError;
pub use synthesis::NormalizedSegment;

#[derive(thiserror::Error, Debug)]
pub enum AnalyzerError {
    #[error(transparent)]
    Framework(#[from] FrameworkError),
    #[error(transparent)]
    Extract(#[from] ExtractError),
    #[error(transparent)]
    Compile(#[from] CompileError),
}

pub fn build_synthetic_module_for_framework(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    whitespace: Option<WhitespaceMode>,
    conventions: &FrameworkConventions,
) -> Result<SyntheticModule, AnalyzerError> {
    match conventions.framework {
        FrameworkKind::Astro => {
            let analysis = AstroAdapter.analyze(
                source,
                &AnalyzeOptions {
                    source_name: source_name.to_string(),
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
                    source_name: source_name.to_string(),
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

fn sort_candidates(candidates: &mut [MacroCandidate]) {
    candidates.sort_by_key(|candidate| (candidate.outer_span.start, candidate.outer_span.end));
}

fn retain_standalone_candidates(candidates: &mut Vec<MacroCandidate>) {
    merge_owned_candidate_normalization_edits(candidates);
    candidates.retain(|candidate| candidate.strategy == MacroCandidateStrategy::Standalone);
}

pub fn build_svelte_compile_plan(
    options: &CompilePlanOptions,
) -> Result<SvelteCompilePlan, CompileError> {
    SvelteCompilePlan::build(
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
        options.whitespace.unwrap_or(WhitespaceMode::Svelte),
        options.conventions.clone(),
        options.runtime_warnings.clone().unwrap_or_default(),
    )
}

pub fn build_astro_compile_plan(
    options: &CompilePlanOptions,
) -> Result<AstroCompilePlan, CompileError> {
    AstroCompilePlan::build(
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
        options.whitespace.unwrap_or(WhitespaceMode::Astro),
        options.conventions.clone(),
        options.runtime_warnings.clone().unwrap_or_default(),
    )
}

pub fn finish_svelte_compile(
    options: &SvelteFinishCompileOptions,
) -> Result<FinishedCompile, CompileError> {
    Ok(finish_compile(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )
    .map_err(CompileError::Lower)?
    .into_public())
}

pub fn finish_astro_compile(
    options: &AstroFinishCompileOptions,
) -> Result<FinishedCompile, CompileError> {
    Ok(finish_compile(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )
    .map_err(CompileError::Lower)?
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
        options.source_name.as_deref().unwrap_or("source"),
        options.synthetic_name.as_deref().unwrap_or("synthetic.js"),
        options.whitespace,
        &options.conventions,
    )?;
    Ok(result.into_ts()?)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CompilePlanOptions {
    pub source: String,
    pub source_name: Option<String>,
    pub synthetic_name: Option<String>,
    pub whitespace: Option<WhitespaceMode>,
    pub runtime_warnings: Option<RuntimeWarningOptions>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteFinishCompileOptions {
    pub plan: SvelteCompilePlan,
    pub source: String,
    pub transformed_programs: TransformedPrograms,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroFinishCompileOptions {
    pub plan: AstroCompilePlan,
    pub source: String,
    pub transformed_programs: TransformedPrograms,
}

#[wasm_bindgen(js_name = "buildSvelteCompilePlan")]
pub fn wasm_build_svelte_compile_plan(
    options: Ts<CompilePlanOptions>,
) -> Result<Ts<SvelteCompilePlan>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_svelte_compile_plan(&options)?;
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
        options.source_name.as_deref().unwrap_or("source"),
        &options.synthetic_module,
        &options.transformed_program,
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "buildAstroCompilePlan")]
pub fn wasm_build_astro_compile_plan(
    options: Ts<CompilePlanOptions>,
) -> Result<Ts<AstroCompilePlan>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_astro_compile_plan(&options)?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "finishSvelteCompile")]
pub fn wasm_finish_svelte_compile(
    options: Ts<SvelteFinishCompileOptions>,
) -> Result<Ts<FinishedCompile>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = finish_svelte_compile(&options)?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "finishAstroCompile")]
pub fn wasm_finish_astro_compile(
    options: Ts<AstroFinishCompileOptions>,
) -> Result<Ts<FinishedCompile>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = finish_astro_compile(&options)?;
    Ok(result.into_ts()?)
}
