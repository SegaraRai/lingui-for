use std::cell::RefCell;

use tree_sitter::{Language, Parser, Tree};

use crate::AnalyzerError;
use crate::wasm::alloc::ensure_tree_sitter_allocator;

thread_local! {
    static ASTRO_PARSER: RefCell<Parser> = build_parser(tree_sitter_astro::LANGUAGE.into());
    static SVELTE_PARSER: RefCell<Parser> = build_parser(tree_sitter_svelte_ng::LANGUAGE.into());
    static JAVASCRIPT_PARSER: RefCell<Parser> = build_parser(tree_sitter_javascript::LANGUAGE.into());
    static TYPESCRIPT_PARSER: RefCell<Parser> = build_parser(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into());
    static TSX_PARSER: RefCell<Parser> = build_parser(tree_sitter_typescript::LANGUAGE_TSX.into());
}

fn build_parser(language: Language) -> RefCell<Parser> {
    ensure_tree_sitter_allocator();

    let mut parser = Parser::new();
    parser
        .set_language(&language)
        .expect("tree-sitter language load failed");
    RefCell::new(parser)
}

pub fn parse_astro(source: &str) -> Result<Tree, AnalyzerError> {
    ASTRO_PARSER
        .with(|parser| parser.borrow_mut().parse(source, None))
        .ok_or(AnalyzerError::ParseFailed)
}

pub fn parse_svelte(source: &str) -> Result<Tree, AnalyzerError> {
    SVELTE_PARSER
        .with(|parser| parser.borrow_mut().parse(source, None))
        .ok_or(AnalyzerError::ParseFailed)
}

pub fn parse_javascript(source: &str) -> Result<Tree, AnalyzerError> {
    JAVASCRIPT_PARSER
        .with(|parser| parser.borrow_mut().parse(source, None))
        .ok_or(AnalyzerError::ParseFailed)
}

pub fn parse_typescript(source: &str) -> Result<Tree, AnalyzerError> {
    TYPESCRIPT_PARSER
        .with(|parser| parser.borrow_mut().parse(source, None))
        .ok_or(AnalyzerError::ParseFailed)
}

pub fn parse_tsx(source: &str) -> Result<Tree, AnalyzerError> {
    TSX_PARSER
        .with(|parser| parser.borrow_mut().parse(source, None))
        .ok_or(AnalyzerError::ParseFailed)
}
