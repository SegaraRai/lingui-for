use lean_string::LeanString;

use lingui_analyzer::WhitespaceMode;
use lingui_analyzer::framework::AnalyzeOptions;

#[path = "svelte_conventions.rs"]
mod svelte_conventions;

pub use svelte_conventions::svelte_default_conventions;

pub fn analyze_options_for_svelte(whitespace: WhitespaceMode) -> AnalyzeOptions {
    AnalyzeOptions {
        source_name: LeanString::from("test.svelte"),
        whitespace,
        conventions: svelte_default_conventions(),
    }
}
