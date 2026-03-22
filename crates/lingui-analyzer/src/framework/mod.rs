pub mod astro;

use crate::AnalyzerError;

pub trait FrameworkAdapter {
    type Analysis;

    fn analyze(&self, source: &str) -> Result<Self::Analysis, AnalyzerError>;
}
