#[derive(thiserror::Error, Debug)]
pub enum AnalyzerError {
    #[error("tree-sitter failed to parse input")]
    ParseFailed,
    #[error("unsupported framework: {0}")]
    UnsupportedFramework(String),
}
