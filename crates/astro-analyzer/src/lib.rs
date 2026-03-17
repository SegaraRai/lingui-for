//! Astro-oriented structural analysis built on tree-sitter.
//!
//! This crate parses `.astro` source using the local `tree-sitter-astro` grammar and returns
//! byte-range based metadata that downstream tooling can use to build synthetic programs,
//! perform macro-aware filtering, and lower rewritten markup back into source text.

mod alloc;
mod analyze;
mod parse;

pub use analyze::{
    AstroAnalysis, AstroAnalyzerError, AstroComponentCandidate, AstroExpression,
    AstroExpressionKind, AstroTagKind, ByteRange, FrontmatterBlock, TextPoint, analyze_astro,
};

use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = "analyzeAstro")]
pub fn wasm_analyze_astro(source: String) -> Result<AstroAnalysis, JsValue> {
    console_error_panic_hook::set_once();

    analyze_astro(&source).map_err(|error| JsValue::from_str(&error.to_string()))
}
