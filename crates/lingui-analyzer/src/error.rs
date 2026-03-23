#[derive(thiserror::Error, Debug)]
pub enum AnalyzerError {
    #[error("tree-sitter failed to parse input")]
    ParseFailed,
    #[error("unsupported framework: {0}")]
    UnsupportedFramework(String),
    #[error("missing transformed declaration: {0}")]
    MissingTransformedDeclaration(String),
    #[error("synthetic mappings overlap around byte {0}")]
    OverlappingMappings(usize),
}
