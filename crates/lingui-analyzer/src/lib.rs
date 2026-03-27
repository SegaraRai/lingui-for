pub mod common;
pub mod compile;
mod error;
pub mod extract;
pub mod framework;
pub mod synthesis;
pub mod wasm;

use serde::{Deserialize, Serialize};
use tsify::{Ts, Tsify};
use wasm_bindgen::JsError;
use wasm_bindgen::prelude::*;

use crate::compile::finish_compile;
use crate::extract::{build_synthetic_module, reinsert_transformed_declarations};
use crate::framework::astro::AstroAdapter;
use crate::framework::svelte::{SvelteAdapter, validate_svelte_extract_candidates};
use crate::framework::{AnalyzeOptions, FrameworkAdapter};

pub use common::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
pub use compile::{
    AstroCompilePlan, CommonCompilePlan, CompileReplacement, CompileTarget, CompileTargetContext,
    CompileTargetOutputKind, CompileTranslationMode, FinishedCompile, RuntimeRequirements,
    SvelteCompilePlan, SvelteCompileRuntimeBindings, SvelteCompileScriptRegion,
    TransformedPrograms,
};
pub use error::AnalyzerError;
pub use extract::{
    ReinsertOptions, ReinsertedModule, ReplacementChunk, SyntheticMapping, SyntheticModule,
    SyntheticModuleOptions,
};
pub use framework::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
    NormalizationEdit, WhitespaceMode,
};
pub use synthesis::NormalizedSegment;

pub fn build_synthetic_module_for_framework(
    framework: &str,
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    whitespace: Option<WhitespaceMode>,
) -> Result<SyntheticModule, AnalyzerError> {
    match framework {
        "astro" => {
            let analysis = AstroAdapter.analyze(
                source,
                &AnalyzeOptions {
                    whitespace: whitespace.unwrap_or(WhitespaceMode::Astro),
                },
            )?;
            let mut candidates = analysis.frontmatter_candidates;
            candidates.extend(
                analysis
                    .template_expressions
                    .into_iter()
                    .flat_map(|expression| expression.candidates),
            );
            candidates.extend(
                analysis
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
                &analysis.macro_imports,
                &candidates,
            ))
        }
        "svelte" => {
            let analysis = SvelteAdapter.analyze(
                source,
                &AnalyzeOptions {
                    whitespace: whitespace.unwrap_or(WhitespaceMode::Svelte),
                },
            )?;
            let imports = analysis
                .scripts
                .iter()
                .flat_map(|script| script.macro_imports.iter().cloned())
                .collect::<Vec<_>>();
            let mut candidates = analysis
                .scripts
                .into_iter()
                .flat_map(|script| script.candidates)
                .collect::<Vec<_>>();
            candidates.extend(
                analysis
                    .template_expressions
                    .into_iter()
                    .flat_map(|expression| expression.candidates),
            );
            candidates.extend(
                analysis
                    .template_components
                    .into_iter()
                    .map(|component| component.candidate),
            );
            validate_svelte_extract_candidates(&candidates)?;
            retain_standalone_candidates(&mut candidates);
            sort_candidates(&mut candidates);
            Ok(build_synthetic_module(
                source,
                source_name,
                synthetic_name,
                &imports,
                &candidates,
            ))
        }
        _ => Err(AnalyzerError::UnsupportedFramework(framework.to_string())),
    }
}

fn sort_candidates(candidates: &mut [MacroCandidate]) {
    candidates.sort_by_key(|candidate| (candidate.outer_span.start, candidate.outer_span.end));
}

fn retain_standalone_candidates(candidates: &mut Vec<MacroCandidate>) {
    candidates.retain(|candidate| candidate.strategy == MacroCandidateStrategy::Standalone);
}

#[wasm_bindgen(js_name = "buildSyntheticModule")]
pub fn wasm_build_synthetic_module(
    options: Ts<SyntheticModuleOptions>,
) -> Result<Ts<SyntheticModule>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = build_synthetic_module_for_framework(
        &options.framework,
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options.synthetic_name.as_deref().unwrap_or("synthetic.js"),
        options.whitespace,
    )?;
    Ok(result.into_ts()?)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CompilePlanOptions {
    pub source: String,
    #[tsify(optional)]
    pub source_name: Option<String>,
    #[tsify(optional)]
    pub synthetic_name: Option<String>,
    #[tsify(optional)]
    pub whitespace: Option<WhitespaceMode>,
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
    let result = SvelteCompilePlan::build_with_whitespace(
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
        options.whitespace.unwrap_or(WhitespaceMode::Svelte),
    )?;
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
        &options.transformed_declarations,
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "buildAstroCompilePlan")]
pub fn wasm_build_astro_compile_plan(
    options: Ts<CompilePlanOptions>,
) -> Result<Ts<AstroCompilePlan>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = AstroCompilePlan::build_with_whitespace(
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
        options.whitespace.unwrap_or(WhitespaceMode::Astro),
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "finishSvelteCompile")]
pub fn wasm_finish_svelte_compile(
    options: Ts<SvelteFinishCompileOptions>,
) -> Result<Ts<FinishedCompile>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = finish_compile(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )?;
    Ok(result.into_ts()?)
}

#[wasm_bindgen(js_name = "finishAstroCompile")]
pub fn wasm_finish_astro_compile(
    options: Ts<AstroFinishCompileOptions>,
) -> Result<Ts<FinishedCompile>, JsError> {
    console_error_panic_hook::set_once();

    let options = options.to_rust()?;
    let result = finish_compile(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )?;
    Ok(result.into_ts()?)
}
