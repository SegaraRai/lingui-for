mod astro;
mod svelte;

use crate::common::{MappedTextError, ScriptLang, Span};
use crate::framework::MacroImport;
use crate::transform::TransformTargetPrototype;

pub use astro::{AstroAdapterError, AstroTransformPlan};
pub use svelte::{
    SvelteAdapterError, SvelteTransformPlan, SvelteTransformRuntimeBindings,
    SvelteTransformScriptRegion,
};

#[derive(thiserror::Error, Debug)]
pub enum AdapterError {
    #[error(transparent)]
    Astro(#[from] AstroAdapterError),
    #[error(transparent)]
    Svelte(#[from] SvelteAdapterError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
}

#[derive(Debug, Clone)]
pub(crate) struct CommonFrameworkTransformAnalysis {
    pub(crate) imports: Vec<MacroImport>,
    pub(crate) prototypes: Vec<TransformTargetPrototype>,
    pub(crate) import_removals: Vec<Span>,
    pub(crate) synthetic_lang: ScriptLang,
    pub(crate) source_anchors: Vec<usize>,
}
