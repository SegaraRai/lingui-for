mod error;
pub mod framework;
mod model;
mod parse;
pub mod scope;

pub use error::AnalyzerError;
pub use model::{
    EmbeddedScriptKind, EmbeddedScriptRegion, MacroCandidate, MacroCandidateKind, MacroFlavor,
    MacroImport, Span, SyntheticModule,
};
