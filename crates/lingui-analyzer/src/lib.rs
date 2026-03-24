pub mod common;
pub mod compile;
mod error;
pub mod extract;
pub mod framework;
pub mod synthetic;
pub mod wasm;

use wasm_bindgen::prelude::*;

use crate::compile::finish_compile;
use crate::extract::{build_synthetic_module_with_names, reinsert_transformed_declarations};
use crate::framework::{FrameworkAdapter, astro::AstroAdapter, svelte::SvelteAdapter};

pub use common::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
pub use compile::{
    CompilePlan, CompilePlanOptions, CompileReplacement, CompileRuntimeBindings,
    CompileScriptRegion, CompileTarget, CompileTargetContext, CompileTargetOutputKind,
    CompileTranslationMode, FinishCompileOptions, FinishedCompile, RuntimeRequirements,
    TransformedPrograms, build_compile_plan_for_framework,
    build_compile_plan_for_framework_with_names,
};
pub use error::AnalyzerError;
pub use extract::{
    ReinsertOptions, ReinsertedModule, ReplacementChunk, SyntheticMapping, SyntheticModule,
    SyntheticModuleOptions,
};
pub use framework::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
};
pub use synthetic::NormalizedSegment;

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

fn validate_svelte_extract_candidates(candidates: &[MacroCandidate]) -> Result<(), AnalyzerError> {
    let offending_macro = candidates
        .iter()
        .find(|candidate| {
            candidate.strategy == MacroCandidateStrategy::Standalone
                && candidate.flavor == MacroFlavor::Direct
                && matches!(
                    candidate.imported_name.as_str(),
                    "t" | "plural" | "select" | "selectOrdinal"
                )
        })
        .map(|candidate| candidate.imported_name.as_str());

    if let Some(imported_name) = offending_macro {
        return Err(AnalyzerError::InvalidMacroUsage(match imported_name {
            "t" => {
                "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string()
            }
            "plural" | "select" | "selectOrdinal" => format!(
                "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
            ),
            other => format!("Unsupported bare direct macro `{other}` in `.svelte` files."),
        }));
    }

    Ok(())
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
    let mut plan = crate::compile::build_compile_plan_for_framework_with_names(
        &options.framework,
        &options.source,
        options.source_name.as_deref().unwrap_or("source"),
        options
            .synthetic_name
            .as_deref()
            .unwrap_or("synthetic-compile.tsx"),
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    repair_compile_plan_for_export(&options.source, &mut plan);
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
        &options.transformed_programs,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}
use crate::compile::plan::repair_compile_plan_for_export;
