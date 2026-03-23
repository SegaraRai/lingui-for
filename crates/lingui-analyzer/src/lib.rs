mod alloc;
mod compile_emit;
mod compile_plan;
mod component_lowering;
mod error;
mod finish_compile;
pub mod framework;
mod js;
mod model;
mod parse;
mod reinsert;
pub mod scope;
pub mod synthetic;
mod utf16;
mod validation;

use wasm_bindgen::prelude::*;

use crate::finish_compile::finish_compile;
use crate::framework::{FrameworkAdapter, astro::AstroAdapter, svelte::SvelteAdapter};
use crate::reinsert::reinsert_transformed_declarations;
use crate::synthetic::build_synthetic_module_with_names;

pub use compile_plan::{
    build_compile_plan_for_framework, build_compile_plan_for_framework_with_names,
};
pub use error::AnalyzerError;
pub use model::{
    CompilePlan, CompilePlanOptions, CompileReplacement, CompileRuntimeBindings,
    CompileScriptRegion, CompileTarget, CompileTargetContext, CompileTargetOutputKind,
    CompileTranslationMode, EmbeddedScriptKind, EmbeddedScriptRegion, FinishCompileOptions,
    FinishedCompile, MacroCandidate, MacroCandidateKind, MacroFlavor, MacroImport,
    NormalizedSegment, ReinsertOptions, ReinsertedModule, ReplacementChunk,
    RuntimeRequirements, Span, SyntheticMapping, SyntheticModule, SyntheticModuleOptions,
};

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

#[wasm_bindgen(js_name = "buildCompilePlanWithOptions")]
pub fn wasm_build_compile_plan_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: CompilePlanOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let plan = build_compile_plan_for_framework_with_names(
        &options.framework,
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

#[wasm_bindgen(js_name = "finishCompileWithOptions")]
pub fn wasm_finish_compile_with_options(options: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let options: FinishCompileOptions = serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let result = finish_compile(
        &options.plan,
        &options.source,
        &options.transformed_declarations,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}
