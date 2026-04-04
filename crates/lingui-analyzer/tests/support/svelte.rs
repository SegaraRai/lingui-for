use lingui_analyzer::WhitespaceMode;
#[path = "svelte_conventions.rs"]
mod svelte_conventions;

use lingui_analyzer::framework::AnalyzeOptions;

pub use svelte_conventions::svelte_default_conventions;

pub fn analyze_options_for_svelte(whitespace: WhitespaceMode) -> AnalyzeOptions {
    AnalyzeOptions {
        source_name: "test.svelte".to_string(),
        whitespace,
        conventions: svelte_default_conventions(),
    }
}
