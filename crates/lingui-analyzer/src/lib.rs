mod error;
pub mod framework;
mod js;
mod model;
mod parse;
pub mod scope;
pub mod synthetic;

pub use error::AnalyzerError;
pub use model::{
    EmbeddedScriptKind, EmbeddedScriptRegion, MacroCandidate, MacroCandidateKind, MacroFlavor,
    MacroImport, Span, SyntheticMapping, SyntheticModule,
};
