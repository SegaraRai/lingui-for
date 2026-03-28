mod astro;
mod svelte;

use crate::common::{ScriptLang, Span};
use crate::compile::CompileTargetPrototype;
use crate::framework::MacroImport;

pub use astro::{AstroAdapterError, AstroCompilePlan};
pub use svelte::{
    SvelteAdapterError, SvelteCompilePlan, SvelteCompileRuntimeBindings, SvelteCompileScriptRegion,
};

#[derive(thiserror::Error, Debug)]
pub enum AdapterError {
    #[error(transparent)]
    Astro(#[from] AstroAdapterError),
    #[error(transparent)]
    Svelte(#[from] SvelteAdapterError),
}

#[derive(Debug, Clone)]
pub(crate) struct CommonFrameworkCompileAnalysis {
    pub(crate) imports: Vec<MacroImport>,
    pub(crate) prototypes: Vec<CompileTargetPrototype>,
    pub(crate) import_removals: Vec<Span>,
    pub(crate) synthetic_lang: ScriptLang,
}
