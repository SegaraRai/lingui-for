pub mod astro;
pub mod svelte;

use crate::AnalyzerError;

pub trait FrameworkAdapter {
    type Analysis;

    fn analyze(&self, source: &str) -> Result<Self::Analysis, AnalyzerError>;
}
