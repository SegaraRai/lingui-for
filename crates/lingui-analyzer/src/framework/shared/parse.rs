use std::cell::RefCell;

use tree_sitter::{Language, Parser, Tree};

use crate::common::ScriptLang;

#[derive(thiserror::Error, Debug, Clone)]
pub enum ParseError {
    #[error("tree-sitter language load failed")]
    LanguageLoadFailed,
    #[error("tree-sitter failed to parse input")]
    ParseFailed,
}

thread_local! {
    static ASTRO_PARSER: Result<RefCell<Parser>, ParseError> = build_parser(tree_sitter_astro::LANGUAGE.into());
    static SVELTE_PARSER: Result<RefCell<Parser>, ParseError> = build_parser(tree_sitter_svelte_ng::LANGUAGE.into());
    static JAVASCRIPT_PARSER: Result<RefCell<Parser>, ParseError> = build_parser(tree_sitter_javascript::LANGUAGE.into());
    static TYPESCRIPT_PARSER: Result<RefCell<Parser>, ParseError> = build_parser(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into());
    static TSX_PARSER: Result<RefCell<Parser>, ParseError> = build_parser(tree_sitter_typescript::LANGUAGE_TSX.into());
}

fn build_parser(language: Language) -> Result<RefCell<Parser>, ParseError> {
    let mut parser = Parser::new();
    parser
        .set_language(&language)
        .map_err(|_| ParseError::LanguageLoadFailed)?;
    Ok(RefCell::new(parser))
}

pub fn parse_astro(source: &str) -> Result<Tree, ParseError> {
    ASTRO_PARSER.with(|parser| {
        parser.as_ref().map_err(Clone::clone).and_then(|parser| {
            parser
                .borrow_mut()
                .parse(source, None)
                .ok_or(ParseError::ParseFailed)
        })
    })
}

pub fn parse_svelte(source: &str) -> Result<Tree, ParseError> {
    SVELTE_PARSER.with(|parser| {
        parser.as_ref().map_err(Clone::clone).and_then(|parser| {
            parser
                .borrow_mut()
                .parse(source, None)
                .ok_or(ParseError::ParseFailed)
        })
    })
}

pub fn parse_javascript(source: &str) -> Result<Tree, ParseError> {
    JAVASCRIPT_PARSER.with(|parser| {
        parser.as_ref().map_err(Clone::clone).and_then(|parser| {
            parser
                .borrow_mut()
                .parse(source, None)
                .ok_or(ParseError::ParseFailed)
        })
    })
}

pub fn parse_typescript(source: &str) -> Result<Tree, ParseError> {
    TYPESCRIPT_PARSER.with(|parser| {
        parser.as_ref().map_err(Clone::clone).and_then(|parser| {
            parser
                .borrow_mut()
                .parse(source, None)
                .ok_or(ParseError::ParseFailed)
        })
    })
}

pub fn parse_tsx(source: &str) -> Result<Tree, ParseError> {
    TSX_PARSER.with(|parser| {
        parser.as_ref().map_err(Clone::clone).and_then(|parser| {
            parser
                .borrow_mut()
                .parse(source, None)
                .ok_or(ParseError::ParseFailed)
        })
    })
}

impl ScriptLang {
    pub fn parse(self, source: &str) -> Result<Tree, ParseError> {
        match self {
            ScriptLang::Js => parse_javascript(source),
            ScriptLang::Ts => parse_typescript(source),
        }
    }
}
