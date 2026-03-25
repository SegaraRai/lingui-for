pub mod common;
pub mod compile;
mod error;
pub mod extract;
pub mod framework;
pub mod plan;
pub mod wasm;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::extract::{build_synthetic_module_with_names, reinsert_transformed_declarations};
use crate::framework::{
    FrameworkAdapter,
    astro::AstroAdapter,
    svelte::{SvelteAdapter, validate_svelte_extract_candidates},
};

pub use common::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
pub use compile::{
    AstroCompilePlan, CommonCompilePlan, CompileReplacement, CompileTarget,
    CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode, FinishedCompile,
    RuntimeRequirements, SvelteCompilePlan, SvelteCompileRuntimeBindings,
    SvelteCompileScriptRegion, TransformedPrograms,
};
pub use error::AnalyzerError;
pub use extract::{
    ReinsertOptions, ReinsertedModule, ReplacementChunk, SyntheticMapping, SyntheticModule,
    SyntheticModuleOptions,
};
pub use framework::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
};
pub use plan::NormalizedSegment;

pub fn build_synthetic_module_for_framework(
    framework: &str,
    source: &str,
) -> Result<SyntheticModule, AnalyzerError> {
    build_synthetic_module_for_framework_with_names(framework, source, "source", "synthetic.js")
}

pub fn build_synthetic_module_for_framework_with_names(
    framework: &str,
    source: &str,
    source_name: &str,
    synthetic_name: &str,
) -> Result<SyntheticModule, AnalyzerError> {
    match framework {
        "astro" => {
            let analysis = AstroAdapter.analyze(source)?;
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
            Ok(build_synthetic_module_with_names(
                source,
                source_name,
                synthetic_name,
                &analysis.macro_imports,
                &candidates,
            ))
        }
        "svelte" => {
            let analysis = SvelteAdapter.analyze(source)?;
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
            Ok(build_synthetic_module_with_names(
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
pub fn wasm_build_synthetic_module(framework: String, source: String) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let module = build_synthetic_module_for_framework(&framework, &source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&module).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = "buildSyntheticModuleWithOptions")]
pub fn wasm_build_synthetic_module_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: SyntheticModuleOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let module = build_synthetic_module_for_framework_with_names(
        &options.framework,
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options.synthetic_name.as_deref().unwrap_or("synthetic.js"),
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&module).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompilePlanOptions {
    pub source: String,
    pub source_name: Option<String>,
    pub synthetic_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SvelteFinishCompileOptions {
    pub plan: SvelteCompilePlan,
    pub source: String,
    pub transformed_programs: TransformedPrograms,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AstroFinishCompileOptions {
    pub plan: AstroCompilePlan,
    pub source: String,
    pub transformed_programs: TransformedPrograms,
}

#[wasm_bindgen(js_name = "buildSvelteCompilePlanWithOptions")]
pub fn wasm_build_svelte_compile_plan_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: CompilePlanOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let plan = SvelteCompilePlan::build(
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&plan).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = "reinsertTransformedDeclarations")]
pub fn wasm_reinsert_transformed_declarations(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: ReinsertOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let result = reinsert_transformed_declarations(
        &options.original_source,
        options.source_name.as_deref().unwrap_or("source"),
        &options.synthetic_module,
        &options.transformed_declarations,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = "buildAstroCompilePlanWithOptions")]
pub fn wasm_build_astro_compile_plan_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: CompilePlanOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let plan = AstroCompilePlan::build(
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&plan).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = "finishSvelteCompileWithOptions")]
pub fn wasm_finish_svelte_compile_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: SvelteFinishCompileOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let result = crate::compile::finish_compile_for_plan(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen(js_name = "finishAstroCompileWithOptions")]
pub fn wasm_finish_astro_compile_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: AstroFinishCompileOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let result = crate::compile::finish_compile_for_plan(
        &options.plan,
        &options.source,
        &options.transformed_programs,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}
