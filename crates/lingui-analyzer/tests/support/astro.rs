use lean_string::LeanString;

use lingui_analyzer::WhitespaceMode;
use lingui_analyzer::framework::AnalyzeOptions;

#[path = "astro_conventions.rs"]
mod astro_conventions;

pub use astro_conventions::astro_default_conventions;

pub fn analyze_options_for_astro(whitespace: WhitespaceMode) -> AnalyzeOptions {
    AnalyzeOptions {
        source_name: LeanString::from("test.astro"),
        whitespace,
        conventions: astro_default_conventions(),
    }
}
