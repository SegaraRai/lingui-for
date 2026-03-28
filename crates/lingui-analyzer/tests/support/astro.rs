use lingui_analyzer::WhitespaceMode;
#[path = "astro_conventions.rs"]
mod astro_conventions;

use lingui_analyzer::framework::AnalyzeOptions;

pub use astro_conventions::astro_default_conventions;

pub fn analyze_options_for_astro(whitespace: WhitespaceMode) -> AnalyzeOptions {
    AnalyzeOptions {
        whitespace,
        conventions: astro_default_conventions(),
    }
}
