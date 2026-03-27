mod astro;
mod svelte;

use crate::common::{ScriptLang, Span};
use crate::compile::CompileTargetPrototype;
use crate::framework::MacroImport;

pub use astro::AstroCompilePlan;
pub use svelte::{SvelteCompilePlan, SvelteCompileRuntimeBindings, SvelteCompileScriptRegion};

#[derive(Debug, Clone)]
pub(crate) struct CommonFrameworkCompileAnalysis {
    pub(crate) imports: Vec<MacroImport>,
    pub(crate) prototypes: Vec<CompileTargetPrototype>,
    pub(crate) import_removals: Vec<Span>,
    pub(crate) synthetic_lang: ScriptLang,
}
