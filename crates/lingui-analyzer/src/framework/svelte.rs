use std::cell::RefCell;

use tree_sitter::{Language, Node, Parser};

use crate::{
    AnalyzerError, EmbeddedScriptKind, EmbeddedScriptRegion, MacroCandidate, MacroImport, Span,
    framework::FrameworkAdapter,
    js::{JsMacroSyntax, collect_macro_candidates_in_javascript},
    parse,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptAnalysis {
    pub scripts: Vec<SvelteScriptBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptBlock {
    pub region: EmbeddedScriptRegion,
    pub is_module: bool,
    pub macro_imports: Vec<MacroImport>,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SvelteAdapter;

impl FrameworkAdapter for SvelteAdapter {
    type Analysis = SvelteScriptAnalysis;

    fn analyze(&self, source: &str) -> Result<Self::Analysis, AnalyzerError> {
        analyze_svelte(source)
    }
}

thread_local! {
    static SVELTE_PARSER: RefCell<Parser> = build_parser(tree_sitter_svelte_ng::LANGUAGE.into());
}

fn build_parser(language: Language) -> RefCell<Parser> {
    let mut parser = Parser::new();
    parser
        .set_language(&language)
        .expect("tree-sitter svelte language load failed");
    RefCell::new(parser)
}

pub fn analyze_svelte(source: &str) -> Result<SvelteScriptAnalysis, AnalyzerError> {
    let tree = SVELTE_PARSER
        .with(|parser| parser.borrow_mut().parse(source, None))
        .ok_or(AnalyzerError::ParseFailed)?;
    let root = tree.root_node();
    let mut scripts = Vec::new();
    collect_script_blocks(source, root, &mut scripts)?;
    Ok(SvelteScriptAnalysis { scripts })
}

fn collect_script_blocks(
    source: &str,
    node: Node<'_>,
    scripts: &mut Vec<SvelteScriptBlock>,
) -> Result<(), AnalyzerError> {
    if node.kind() == "script_element" {
        if let Some(script) = analyze_script_block(source, node)? {
            scripts.push(script);
        }
        return Ok(());
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_script_blocks(source, child, scripts)?;
    }
    Ok(())
}

fn analyze_script_block(
    source: &str,
    script_element: Node<'_>,
) -> Result<Option<SvelteScriptBlock>, AnalyzerError> {
    let mut cursor = script_element.walk();
    let mut raw_text = None;
    let mut start_tag = None;
    for child in script_element.children(&mut cursor) {
        match child.kind() {
            "raw_text" => raw_text = Some(child),
            "start_tag" => start_tag = Some(child),
            _ => {}
        }
    }

    let Some(raw_text) = raw_text else {
        return Ok(None);
    };
    let start_tag = start_tag.expect("script element should have start tag");
    let content_region = EmbeddedScriptRegion {
        kind: EmbeddedScriptKind::Script,
        outer_span: Span::from_node(script_element),
        inner_span: Span::from_node(raw_text),
    };

    let script_source = &source[content_region.inner_span.start..content_region.inner_span.end];
    let macro_imports =
        collect_script_macro_imports(script_source, content_region.inner_span.start)?;
    let candidates = collect_macro_candidates_in_javascript(
        script_source,
        &macro_imports,
        content_region.inner_span.start,
        JsMacroSyntax::Svelte,
    )?;

    Ok(Some(SvelteScriptBlock {
        region: content_region,
        is_module: start_tag_has_context_module(source, start_tag),
        macro_imports,
        candidates,
    }))
}

fn collect_script_macro_imports(
    source: &str,
    base_offset: usize,
) -> Result<Vec<MacroImport>, AnalyzerError> {
    let js_tree = parse::parse_javascript(source)?;
    let root = js_tree.root_node();
    let mut imports = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        if child.kind() != "import_statement" {
            continue;
        }

        let Some(source_node) = child.child_by_field_name("source") else {
            continue;
        };
        let Some(module_specifier) = unquote(text(source, source_node)) else {
            continue;
        };
        if !is_macro_module_specifier(&module_specifier) {
            continue;
        }

        collect_import_specifiers_from_node(
            source,
            child,
            base_offset,
            &module_specifier,
            &mut imports,
        );
    }

    Ok(imports)
}

fn collect_import_specifiers_from_node(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    module_specifier: &str,
    imports: &mut Vec<MacroImport>,
) {
    if node.kind() == "import_specifier" {
        let imported = node.child_by_field_name("name");
        let local = node.child_by_field_name("alias").or(imported);
        let (Some(imported), Some(local)) = (imported, local) else {
            return;
        };

        imports.push(MacroImport {
            source: module_specifier.to_string(),
            imported_name: text(source, imported).to_string(),
            local_name: text(source, local).to_string(),
            span: shift_span(Span::from_node(node), base_offset),
        });
        return;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_import_specifiers_from_node(source, child, base_offset, module_specifier, imports);
    }
}

fn start_tag_has_context_module(source: &str, start_tag: Node<'_>) -> bool {
    let mut cursor = start_tag.walk();
    for child in start_tag.children(&mut cursor) {
        if child.kind() != "attribute" {
            continue;
        }

        let attribute_text = text(source, child);
        if attribute_text.contains("context") && attribute_text.contains("module") {
            return true;
        }
    }

    false
}

fn shift_span(span: Span, base_offset: usize) -> Span {
    Span::new(span.start + base_offset, span.end + base_offset)
}

fn text<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}

fn unquote(text: &str) -> Option<String> {
    if text.len() < 2 {
        return None;
    }

    let bytes = text.as_bytes();
    let quote = bytes.first().copied()?;
    if quote != b'"' && quote != b'\'' {
        return None;
    }

    if bytes.last().copied()? != quote {
        return None;
    }

    Some(text[1..text.len() - 1].to_string())
}

fn is_macro_module_specifier(specifier: &str) -> bool {
    specifier.ends_with("/macro")
}
