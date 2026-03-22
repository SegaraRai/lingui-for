use tree_sitter::Node;

use crate::{
    AnalyzerError, EmbeddedScriptKind, EmbeddedScriptRegion, MacroCandidate, MacroCandidateKind,
    MacroFlavor, MacroImport, framework::FrameworkAdapter, model::Span, parse, scope::LexicalScope,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroFrontmatterAnalysis {
    pub frontmatter: Option<EmbeddedScriptRegion>,
    pub macro_imports: Vec<MacroImport>,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct AstroAdapter;

impl FrameworkAdapter for AstroAdapter {
    type Analysis = AstroFrontmatterAnalysis;

    fn analyze(&self, source: &str) -> Result<Self::Analysis, AnalyzerError> {
        analyze_frontmatter(source)
    }
}

pub fn analyze_frontmatter(source: &str) -> Result<AstroFrontmatterAnalysis, AnalyzerError> {
    let astro_tree = parse::parse_astro(source)?;
    let root = astro_tree.root_node();
    let frontmatter = find_frontmatter(root);

    let Some(frontmatter_region) = frontmatter.clone() else {
        return Ok(AstroFrontmatterAnalysis {
            frontmatter: None,
            macro_imports: Vec::new(),
            candidates: Vec::new(),
        });
    };

    let frontmatter_source =
        &source[frontmatter_region.inner_span.start..frontmatter_region.inner_span.end];
    let js_tree = parse::parse_javascript(frontmatter_source)?;
    let js_root = js_tree.root_node();

    let macro_imports = collect_macro_imports(
        frontmatter_source,
        js_root,
        frontmatter_region.inner_span.start,
    );
    let candidates = collect_macro_candidates(
        frontmatter_source,
        js_root,
        &macro_imports,
        frontmatter_region.inner_span.start,
    );

    Ok(AstroFrontmatterAnalysis {
        frontmatter,
        macro_imports,
        candidates,
    })
}

fn find_frontmatter(root: Node<'_>) -> Option<EmbeddedScriptRegion> {
    let mut cursor = root.walk();
    root.children(&mut cursor)
        .find(|node| node.kind() == "frontmatter")
        .map(|node| {
            let content = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "frontmatter_js_block");

            let inner_span = content
                .map(Span::from_node)
                .unwrap_or_else(|| Span::new(node.start_byte(), node.start_byte()));

            EmbeddedScriptRegion {
                kind: EmbeddedScriptKind::Frontmatter,
                outer_span: Span::from_node(node),
                inner_span,
            }
        })
}

fn collect_macro_imports(source: &str, root: Node<'_>, base_offset: usize) -> Vec<MacroImport> {
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

        collect_import_specifiers(source, child, base_offset, &module_specifier, &mut imports);
    }

    imports
}

fn collect_import_specifiers(
    source: &str,
    import_statement: Node<'_>,
    base_offset: usize,
    module_specifier: &str,
    imports: &mut Vec<MacroImport>,
) {
    let mut cursor = import_statement.walk();
    for node in import_statement.children(&mut cursor) {
        collect_import_specifiers_from_node(source, node, base_offset, module_specifier, imports);
    }
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

fn collect_macro_candidates(
    source: &str,
    root: Node<'_>,
    imports: &[MacroImport],
    base_offset: usize,
) -> Vec<MacroCandidate> {
    let mut scope = LexicalScope::new(imports.iter().cloned());
    let mut candidates = Vec::new();
    visit_node(source, root, base_offset, &mut scope, &mut candidates);
    candidates
}

fn visit_node(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    scope: &mut LexicalScope,
    candidates: &mut Vec<MacroCandidate>,
) {
    match node.kind() {
        "program" => {
            declare_hoisted_bindings(source, node, scope);
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, scope, candidates);
            }
        }
        "statement_block" | "class_body" => {
            scope.push();
            declare_hoisted_bindings(source, node, scope);
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, scope, candidates);
            }
            scope.pop();
        }
        "function_declaration"
        | "generator_function_declaration"
        | "function_expression"
        | "generator_function"
        | "arrow_function" => {
            visit_function_like(source, node, base_offset, scope, candidates);
        }
        "lexical_declaration" | "variable_declaration" => {
            declare_variable_declaration(source, node, scope);
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, scope, candidates);
            }
        }
        "catch_clause" => {
            scope.push();
            if let Some(parameter) = node.child_by_field_name("parameter") {
                declare_pattern(source, parameter, scope);
            }
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "statement_block" {
                    visit_node(source, child, base_offset, scope, candidates);
                }
            }
            scope.pop();
        }
        "call_expression" => {
            if let Some(candidate) = to_call_candidate(source, node, base_offset, scope) {
                candidates.push(candidate);
            }

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, scope, candidates);
            }
        }
        _ => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, scope, candidates);
            }
        }
    }
}

fn visit_function_like(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    scope: &mut LexicalScope,
    candidates: &mut Vec<MacroCandidate>,
) {
    scope.push();

    if (node.kind() == "function_expression" || node.kind() == "generator_function")
        && let Some(name) = node.child_by_field_name("name")
    {
        declare_pattern(source, name, scope);
    }

    if let Some(parameters) = node.child_by_field_name("parameters") {
        let mut cursor = parameters.walk();
        for child in parameters.children(&mut cursor) {
            declare_pattern(source, child, scope);
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "formal_parameters" || child.kind() == "identifier" {
            continue;
        }

        visit_node(source, child, base_offset, scope, candidates);
    }

    scope.pop();
}

fn declare_hoisted_bindings(source: &str, node: Node<'_>, scope: &mut LexicalScope) {
    match node.kind() {
        "program" | "statement_block" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                match child.kind() {
                    "function_declaration"
                    | "generator_function_declaration"
                    | "class_declaration" => {
                        if let Some(name) = child.child_by_field_name("name") {
                            declare_pattern(source, name, scope);
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

fn declare_variable_declaration(source: &str, node: Node<'_>, scope: &mut LexicalScope) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() != "variable_declarator" {
            continue;
        }

        if let Some(name) = child.child_by_field_name("name") {
            declare_pattern(source, name, scope);
        }
    }
}

fn declare_pattern(source: &str, node: Node<'_>, scope: &mut LexicalScope) {
    match node.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => {
            scope.declare(text(source, node));
        }
        "array_pattern" | "object_pattern" | "assignment_pattern" | "pair_pattern"
        | "rest_pattern" | "formal_parameters" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                declare_pattern(source, child, scope);
            }
        }
        "pair" => {
            if let Some(value) = node.child_by_field_name("value") {
                declare_pattern(source, value, scope);
            }
        }
        _ => {}
    }
}

fn to_call_candidate(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    scope: &LexicalScope,
) -> Option<MacroCandidate> {
    let function = node.child_by_field_name("function")?;
    let identifier = call_target_identifier(function)?;
    let local_name = text(source, identifier);
    let import_decl = scope.resolve_macro(local_name)?;
    let kind = match node.child_by_field_name("arguments")?.kind() {
        "template_string" => MacroCandidateKind::TaggedTemplateExpression,
        _ => MacroCandidateKind::CallExpression,
    };

    Some(MacroCandidate {
        kind,
        imported_name: import_decl.imported_name.clone(),
        local_name: import_decl.local_name.clone(),
        flavor: MacroFlavor::Direct,
        outer_span: shift_span(Span::from_node(node), base_offset),
        normalized_span: shift_span(Span::from_node(node), base_offset),
        strip_spans: Vec::new(),
    })
}

fn call_target_identifier(node: Node<'_>) -> Option<Node<'_>> {
    if node.kind() == "identifier" {
        return Some(node);
    }

    None
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
