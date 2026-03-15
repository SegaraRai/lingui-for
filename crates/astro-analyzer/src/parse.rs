use std::cell::RefCell;

use tree_sitter::Parser;

use crate::{AstroAnalyzerError, alloc::ensure_tree_sitter_allocator};

thread_local! {
    static ASTRO_PARSER: RefCell<Parser> = {
        ensure_tree_sitter_allocator();

        let mut parser = Parser::new();
        let language: tree_sitter::Language = tree_sitter_astro::LANGUAGE.into();
        parser
            .set_language(&language)
            .expect("tree-sitter-astro language load failed");
        RefCell::new(parser)
    };
}

pub fn parse_astro(source: &str) -> Result<tree_sitter::Tree, AstroAnalyzerError> {
    ensure_tree_sitter_allocator();

    ASTRO_PARSER
        .with(|parser| {
            let mut parser = parser.borrow_mut();
            parser.parse(source, None)
        })
        .ok_or(AstroAnalyzerError::ParseFailed)
}
