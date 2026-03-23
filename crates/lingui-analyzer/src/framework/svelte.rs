use std::cell::RefCell;

use tree_sitter::{Language, Node, Parser};

use crate::{
    AnalyzerError, EmbeddedScriptKind, EmbeddedScriptRegion, MacroCandidate, MacroImport, Span,
    alloc::ensure_tree_sitter_allocator,
    framework::FrameworkAdapter,
    js::{
        BindingParseMode, JsLikeLanguage, JsMacroSyntax,
        collect_declared_names_from_binding_source, collect_macro_candidates_in_javascript,
        collect_macro_candidates_in_javascript_with_shadowing,
    },
    parse,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptAnalysis {
    pub scripts: Vec<SvelteScriptBlock>,
    pub template_expressions: Vec<SvelteTemplateExpression>,
    pub template_components: Vec<SvelteTemplateComponent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptBlock {
    pub region: EmbeddedScriptRegion,
    pub is_module: bool,
    pub macro_imports: Vec<MacroImport>,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteTemplateExpression {
    pub outer_span: Span,
    pub inner_span: Span,
    pub candidates: Vec<MacroCandidate>,
    pub shadowed_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteTemplateComponent {
    pub candidate: MacroCandidate,
    pub shadowed_names: Vec<String>,
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
    ensure_tree_sitter_allocator();
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
    let template_imports = scripts
        .iter()
        .filter(|script| !script.is_module)
        .flat_map(|script| script.macro_imports.iter().cloned())
        .collect::<Vec<_>>();
    let mut template_expressions = Vec::new();
    let mut template_components = Vec::new();
    collect_template_expressions(
        source,
        root,
        &template_imports,
        &mut Vec::new(),
        &mut template_expressions,
        &mut template_components,
    )?;
    Ok(SvelteScriptAnalysis {
        scripts,
        template_expressions,
        template_components,
    })
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
    let macro_imports = collect_script_macro_imports(
        script_source,
        content_region.inner_span.start,
        script_language(source, start_tag),
    )?;
    let candidates = collect_macro_candidates_in_javascript(
        script_source,
        &macro_imports,
        content_region.inner_span.start,
        JsMacroSyntax::Svelte,
        script_language(source, start_tag),
    )?;

    Ok(Some(SvelteScriptBlock {
        region: content_region,
        is_module: start_tag_has_context_module(source, start_tag),
        macro_imports,
        candidates,
    }))
}

fn collect_template_expressions(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &mut Vec<Vec<String>>,
    expressions: &mut Vec<SvelteTemplateExpression>,
    components: &mut Vec<SvelteTemplateComponent>,
) -> Result<(), AnalyzerError> {
    match node.kind() {
        "script_element" | "style_element" => return Ok(()),
        "expression" => {
            push_expression(source, node, imports, scope_stack, expressions)?;
            return Ok(());
        }
        "html_tag" | "render_tag" | "key_start" | "await_start" | "if_start" | "else_if_start" => {
            push_raw_text_expression(source, node, imports, scope_stack, expressions)?;
        }
        "const_tag" => {
            let names = declared_names_from_const_tag(source, node)?;
            if !names.is_empty() {
                if let Some(frame) = scope_stack.last_mut() {
                    frame.extend(names);
                } else {
                    scope_stack.push(names);
                }
            }
            return Ok(());
        }
        "if_statement" | "else_block" | "else_if_block" | "key_statement" => {
            scope_stack.push(Vec::new());
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                collect_template_expressions(
                    source,
                    child,
                    imports,
                    scope_stack,
                    expressions,
                    components,
                )?;
            }
            scope_stack.pop();
            return Ok(());
        }
        "each_statement" => {
            visit_each_statement(source, node, imports, scope_stack, expressions, components)?;
            return Ok(());
        }
        "then_block" => {
            visit_named_block(
                source,
                node,
                imports,
                scope_stack,
                expressions,
                components,
                "then_start",
            )?;
            return Ok(());
        }
        "catch_block" => {
            visit_named_block(
                source,
                node,
                imports,
                scope_stack,
                expressions,
                components,
                "catch_start",
            )?;
            return Ok(());
        }
        "snippet_statement" => {
            visit_snippet_statement(source, node, imports, scope_stack, expressions, components)?;
            return Ok(());
        }
        "element" | "self_closing_tag" => {
            visit_element_like(source, node, imports, scope_stack, expressions, components)?;
            return Ok(());
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_template_expressions(source, child, imports, scope_stack, expressions, components)?;
    }
    Ok(())
}

fn push_expression(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &[Vec<String>],
    expressions: &mut Vec<SvelteTemplateExpression>,
) -> Result<(), AnalyzerError> {
    let Some(raw_text) = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "svelte_raw_text")
    else {
        return Ok(());
    };

    let inner_span = Span::from_node(raw_text);
    let outer_span = Span::from_node(node);
    let expression_source = &source[inner_span.start..inner_span.end];
    let shadowed_names = scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let candidates = collect_macro_candidates_in_javascript_with_shadowing(
        expression_source,
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        // Svelte template expressions accept TypeScript syntax such as `as` and `satisfies`.
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    expressions.push(SvelteTemplateExpression {
        outer_span,
        inner_span,
        candidates,
        shadowed_names,
    });
    Ok(())
}

fn push_raw_text_expression(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &[Vec<String>],
    expressions: &mut Vec<SvelteTemplateExpression>,
) -> Result<(), AnalyzerError> {
    let Some(raw_text) = find_first_descendant(node, "svelte_raw_text") else {
        return Ok(());
    };

    let inner_span = Span::from_node(raw_text);
    let shadowed_names = scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let candidates = collect_macro_candidates_in_javascript_with_shadowing(
        text(source, raw_text),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    expressions.push(SvelteTemplateExpression {
        outer_span: Span::from_node(node),
        inner_span,
        candidates,
        shadowed_names,
    });
    Ok(())
}

fn visit_each_statement(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &mut Vec<Vec<String>>,
    expressions: &mut Vec<SvelteTemplateExpression>,
    components: &mut Vec<SvelteTemplateComponent>,
) -> Result<(), AnalyzerError> {
    let start = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "each_start");
    if let Some(start) = start {
        push_each_start_expression(source, start, imports, scope_stack, expressions)?;
    }
    let frame = start
        .map(|start| declared_names_from_each_start(source, start))
        .transpose()?
        .unwrap_or_default();

    scope_stack.push(frame);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "each_start" || child.kind() == "each_end" {
            continue;
        }
        collect_template_expressions(source, child, imports, scope_stack, expressions, components)?;
    }
    scope_stack.pop();
    Ok(())
}

fn push_each_start_expression(
    source: &str,
    each_start: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &[Vec<String>],
    expressions: &mut Vec<SvelteTemplateExpression>,
) -> Result<(), AnalyzerError> {
    let Some(identifier) = each_start.child_by_field_name("identifier") else {
        return Ok(());
    };

    let inner_span = Span::from_node(identifier);
    let shadowed_names = scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let candidates = collect_macro_candidates_in_javascript_with_shadowing(
        text(source, identifier),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    expressions.push(SvelteTemplateExpression {
        outer_span: Span::from_node(each_start),
        inner_span,
        candidates,
        shadowed_names,
    });
    Ok(())
}

fn visit_named_block(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &mut Vec<Vec<String>>,
    expressions: &mut Vec<SvelteTemplateExpression>,
    components: &mut Vec<SvelteTemplateComponent>,
    start_kind: &str,
) -> Result<(), AnalyzerError> {
    let start = node
        .children(&mut node.walk())
        .find(|child| child.kind() == start_kind);
    let frame = start
        .map(|start| {
            declared_names_from_optional_raw_text(source, start, BindingParseMode::SingleParam)
        })
        .transpose()?
        .flatten()
        .unwrap_or_default();

    scope_stack.push(frame);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == start_kind {
            continue;
        }
        collect_template_expressions(source, child, imports, scope_stack, expressions, components)?;
    }
    scope_stack.pop();
    Ok(())
}

fn visit_snippet_statement(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &mut Vec<Vec<String>>,
    expressions: &mut Vec<SvelteTemplateExpression>,
    components: &mut Vec<SvelteTemplateComponent>,
) -> Result<(), AnalyzerError> {
    let start = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "snippet_start");
    let frame = start
        .map(|start| {
            declared_names_from_optional_raw_text(source, start, BindingParseMode::FunctionParams)
        })
        .transpose()?
        .flatten()
        .unwrap_or_default();

    scope_stack.push(frame);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "snippet_start" || child.kind() == "snippet_end" {
            continue;
        }
        collect_template_expressions(source, child, imports, scope_stack, expressions, components)?;
    }
    scope_stack.pop();
    Ok(())
}

fn visit_element_like(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &mut Vec<Vec<String>>,
    expressions: &mut Vec<SvelteTemplateExpression>,
    components: &mut Vec<SvelteTemplateComponent>,
) -> Result<(), AnalyzerError> {
    if let Some(candidate) = component_candidate_from_element(source, node, imports, scope_stack) {
        components.push(candidate);
    }

    let let_bindings = let_bindings_from_element(source, node);
    let has_let_bindings = !let_bindings.is_empty();
    if has_let_bindings {
        scope_stack.push(let_bindings);
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if node.kind() == "element" && child.kind() == "end_tag" {
            continue;
        }
        collect_template_expressions(source, child, imports, scope_stack, expressions, components)?;
    }

    if has_let_bindings {
        scope_stack.pop();
    }
    Ok(())
}

fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    scope_stack: &[Vec<String>],
) -> Option<SvelteTemplateComponent> {
    let tag = match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag")?,
        "self_closing_tag" => node,
        _ => return None,
    };
    let tag_name_node = tag
        .children(&mut tag.walk())
        .find(|child| child.kind() == "tag_name")?;
    let tag_name = text(source, tag_name_node);
    if !is_component_tag_name(tag_name) {
        return None;
    }

    let shadowed_names = scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    if shadowed_names.iter().any(|name| name == tag_name) {
        return None;
    }

    let import_decl = imports
        .iter()
        .find(|import_decl| import_decl.local_name == tag_name)?;
    Some(SvelteTemplateComponent {
        candidate: MacroCandidate {
            kind: crate::MacroCandidateKind::Component,
            imported_name: import_decl.imported_name.clone(),
            local_name: import_decl.local_name.clone(),
            flavor: crate::MacroFlavor::Direct,
            outer_span: Span::from_node(node),
            normalized_span: Span::from_node(node),
            strip_spans: Vec::new(),
            source_map_anchor: component_source_map_anchor(source, node),
        },
        shadowed_names,
    })
}

fn component_source_map_anchor(source: &str, node: Node<'_>) -> Option<Span> {
    if node.kind() != "element" {
        return Some(Span::from_node(node));
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "start_tag" || child.kind() == "end_tag" {
            continue;
        }

        let child_text = text(source, child);
        if let Some(trimmed_start) = child_text.find(|char: char| !char.is_whitespace()) {
            return Some(Span::new(
                child.start_byte() + trimmed_start,
                child.end_byte(),
            ));
        }
    }

    Some(Span::from_node(node))
}

fn declared_names_from_const_tag(
    source: &str,
    node: Node<'_>,
) -> Result<Vec<String>, AnalyzerError> {
    declared_names_from_optional_raw_text(source, node, BindingParseMode::VariableDeclarator)
        .map(|names| names.unwrap_or_default())
}

fn declared_names_from_each_start(
    source: &str,
    node: Node<'_>,
) -> Result<Vec<String>, AnalyzerError> {
    let Some(parameter) = node.child_by_field_name("parameter") else {
        return Ok(Vec::new());
    };
    collect_declared_names_from_binding_source(
        text(source, parameter),
        BindingParseMode::FunctionParams,
        JsLikeLanguage::TypeScript,
    )
}

fn declared_names_from_optional_raw_text(
    source: &str,
    node: Node<'_>,
    mode: BindingParseMode,
) -> Result<Option<Vec<String>>, AnalyzerError> {
    let raw_text = find_first_descendant(node, "svelte_raw_text");
    let Some(raw_text) = raw_text else {
        return Ok(None);
    };
    let names = collect_declared_names_from_binding_source(
        text(source, raw_text),
        mode,
        JsLikeLanguage::TypeScript,
    )?;
    Ok(Some(names))
}

fn let_bindings_from_element(source: &str, node: Node<'_>) -> Vec<String> {
    let tag = match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag"),
        "self_closing_tag" => Some(node),
        _ => None,
    };
    let Some(tag) = tag else {
        return Vec::new();
    };

    let mut names = Vec::new();
    let mut cursor = tag.walk();
    for child in tag.children(&mut cursor) {
        if child.kind() != "attribute" {
            continue;
        }
        let Some(name_node) = child
            .children(&mut child.walk())
            .find(|grandchild| grandchild.kind() == "attribute_name")
        else {
            continue;
        };
        let attribute_name = text(source, name_node);
        if let Some(local_name) = attribute_name.strip_prefix("let:") {
            names.push(local_name.to_string());
        }
    }
    names
}

fn is_component_tag_name(tag_name: &str) -> bool {
    tag_name
        .chars()
        .next()
        .map(|first| first.is_ascii_uppercase())
        .unwrap_or(false)
}

fn collect_script_macro_imports(
    source: &str,
    base_offset: usize,
    language: JsLikeLanguage,
) -> Result<Vec<MacroImport>, AnalyzerError> {
    let js_tree = match language {
        JsLikeLanguage::JavaScript => parse::parse_javascript(source)?,
        JsLikeLanguage::TypeScript => parse::parse_typescript(source)?,
    };
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

fn script_language(source: &str, start_tag: Node<'_>) -> JsLikeLanguage {
    let mut cursor = start_tag.walk();
    for child in start_tag.children(&mut cursor) {
        if child.kind() != "attribute" {
            continue;
        }

        let attribute_text = text(source, child);
        if attribute_text.contains("lang") && attribute_text.contains("ts") {
            return JsLikeLanguage::TypeScript;
        }
    }

    JsLikeLanguage::JavaScript
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

fn find_first_descendant<'a>(node: Node<'a>, kind: &str) -> Option<Node<'a>> {
    if node.kind() == kind {
        return Some(node);
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(found) = find_first_descendant(child, kind) {
            return Some(found);
        }
    }

    None
}
