mod alloc;
mod error;
pub mod framework;
mod js;
mod model;
mod parse;
pub mod scope;
pub mod synthetic;
mod utf16;

use wasm_bindgen::prelude::*;

use crate::framework::{FrameworkAdapter, astro::AstroAdapter, svelte::SvelteAdapter};
use crate::synthetic::build_synthetic_module;

pub use error::AnalyzerError;
pub use model::{
    EmbeddedScriptKind, EmbeddedScriptRegion, MacroCandidate, MacroCandidateKind, MacroFlavor,
    MacroImport, Span, SyntheticMapping, SyntheticModule,
};

pub fn build_synthetic_module_for_framework(
    framework: &str,
    source: &str,
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
            Ok(build_synthetic_module(
                source,
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
            Ok(build_synthetic_module(source, &imports, &candidates))
        }
        _ => Err(AnalyzerError::UnsupportedFramework(framework.to_string())),
    }
}

fn sort_candidates(candidates: &mut [MacroCandidate]) {
    candidates.sort_by_key(|candidate| (candidate.outer_span.start, candidate.outer_span.end));
}

#[wasm_bindgen(js_name = "buildSyntheticModule")]
pub fn wasm_build_synthetic_module(
    framework: String,
    source: String,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let module = build_synthetic_module_for_framework(&framework, &source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&module)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}
