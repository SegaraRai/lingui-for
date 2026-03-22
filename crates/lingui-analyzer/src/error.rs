#[derive(thiserror::Error, Debug)]
pub enum AnalyzerError {
    #[error("tree-sitter failed to parse input")]
    ParseFailed,
}
