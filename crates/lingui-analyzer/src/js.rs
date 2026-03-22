use tree_sitter::Node;

use crate::{
    MacroCandidate, MacroCandidateKind, MacroFlavor, MacroImport, Span, parse, scope::LexicalScope,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsMacroSyntax {
    Standard,
    Svelte,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsLikeLanguage {
    JavaScript,
    TypeScript,
}

pub fn collect_macro_candidates_in_javascript(
    source: &str,
    imports: &[MacroImport],
    base_offset: usize,
    syntax: JsMacroSyntax,
    language: JsLikeLanguage,
) -> Result<Vec<MacroCandidate>, crate::AnalyzerError> {
    collect_macro_candidates_in_javascript_with_shadowing(
        source,
        imports,
        base_offset,
        syntax,
        language,
        &[],
    )
}

pub fn collect_macro_candidates_in_javascript_with_shadowing(
    source: &str,
    imports: &[MacroImport],
    base_offset: usize,
    syntax: JsMacroSyntax,
    language: JsLikeLanguage,
    shadowed_names: &[String],
) -> Result<Vec<MacroCandidate>, crate::AnalyzerError> {
    let js_tree = match language {
        JsLikeLanguage::JavaScript => parse::parse_javascript(source)?,
        JsLikeLanguage::TypeScript => parse::parse_typescript(source)?,
    };
    let js_root = js_tree.root_node();
    Ok(collect_macro_candidates_from_root(
        source,
        js_root,
        imports,
        base_offset,
        syntax,
        shadowed_names,
    ))
}

pub fn collect_macro_candidates_from_root(
    source: &str,
    root: Node<'_>,
    imports: &[MacroImport],
    base_offset: usize,
    syntax: JsMacroSyntax,
    shadowed_names: &[String],
) -> Vec<MacroCandidate> {
    let mut scope = LexicalScope::new(imports.iter().cloned());
    scope.declare_many(shadowed_names.iter().cloned());
    let mut candidates = Vec::new();
    visit_node(
        source,
        root,
        base_offset,
        syntax,
        &mut scope,
        &mut candidates,
    );
    candidates
}

pub fn collect_declared_names_from_binding_source(
    source: &str,
    mode: BindingParseMode,
    language: JsLikeLanguage,
) -> Result<Vec<String>, crate::AnalyzerError> {
    let wrapped = match mode {
        BindingParseMode::VariableDeclarator => format!("const {source};"),
        BindingParseMode::FunctionParams => format!("function __lf({source}) {{}}"),
        BindingParseMode::SingleParam => format!("(({source}) => 0)"),
    };

    let tree = match language {
        JsLikeLanguage::JavaScript => parse::parse_javascript(&wrapped)?,
        JsLikeLanguage::TypeScript => parse::parse_typescript(&wrapped)?,
    };
    let root = tree.root_node();
    let mut names = Vec::new();
    collect_declared_names(root, &wrapped, &mut names);
    Ok(names)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindingParseMode {
    VariableDeclarator,
    FunctionParams,
    SingleParam,
}

fn visit_node(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    syntax: JsMacroSyntax,
    scope: &mut LexicalScope,
    candidates: &mut Vec<MacroCandidate>,
) {
    match node.kind() {
        "program" => {
            declare_hoisted_bindings(source, node, scope);
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, syntax, scope, candidates);
            }
        }
        "statement_block" | "class_body" => {
            scope.push();
            declare_hoisted_bindings(source, node, scope);
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, syntax, scope, candidates);
            }
            scope.pop();
        }
        "function_declaration"
        | "generator_function_declaration"
        | "function_expression"
        | "generator_function"
        | "arrow_function" => {
            visit_function_like(source, node, base_offset, syntax, scope, candidates);
        }
        "lexical_declaration" | "variable_declaration" => {
            declare_variable_declaration(source, node, scope);
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, syntax, scope, candidates);
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
                    visit_node(source, child, base_offset, syntax, scope, candidates);
                }
            }
            scope.pop();
        }
        "call_expression" => {
            if let Some(candidate) = to_call_candidate(source, node, base_offset, syntax, scope) {
                candidates.push(candidate);
            }

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, syntax, scope, candidates);
            }
        }
        _ => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                visit_node(source, child, base_offset, syntax, scope, candidates);
            }
        }
    }
}

fn visit_function_like(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    syntax: JsMacroSyntax,
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

        visit_node(source, child, base_offset, syntax, scope, candidates);
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
        "required_parameter" | "optional_parameter" => {
            if let Some(pattern) = node.child_by_field_name("pattern") {
                declare_pattern(source, pattern, scope);
            } else if let Some(name) = node.child_by_field_name("name") {
                declare_pattern(source, name, scope);
            }
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
    syntax: JsMacroSyntax,
    scope: &LexicalScope,
) -> Option<MacroCandidate> {
    let function = node.child_by_field_name("function")?;
    let arguments = node.child_by_field_name("arguments")?;

    match syntax {
        JsMacroSyntax::Standard => {
            let identifier = call_target_identifier(function)?;
            let local_name = text(source, identifier);
            let import_decl = scope.resolve_macro(local_name)?;
            Some(MacroCandidate {
                kind: candidate_kind_from_arguments(arguments),
                imported_name: import_decl.imported_name.clone(),
                local_name: import_decl.local_name.clone(),
                flavor: MacroFlavor::Direct,
                outer_span: shift_span(Span::from_node(node), base_offset),
                normalized_span: shift_span(Span::from_node(node), base_offset),
                strip_spans: Vec::new(),
            })
        }
        JsMacroSyntax::Svelte => {
            to_svelte_call_candidate(source, node, function, arguments, base_offset, scope)
        }
    }
}

fn to_svelte_call_candidate(
    source: &str,
    node: Node<'_>,
    function: Node<'_>,
    arguments: Node<'_>,
    base_offset: usize,
    scope: &LexicalScope,
) -> Option<MacroCandidate> {
    if let Some(identifier) = call_target_identifier(function) {
        let local_name = text(source, identifier);

        if let Some(reactive_name) = local_name.strip_prefix('$') {
            let import_decl = scope.resolve_macro(reactive_name)?;
            let identifier_span = shift_span(Span::from_node(identifier), base_offset);

            return Some(MacroCandidate {
                kind: candidate_kind_from_arguments(arguments),
                imported_name: import_decl.imported_name.clone(),
                local_name: import_decl.local_name.clone(),
                flavor: MacroFlavor::Reactive,
                outer_span: shift_span(Span::from_node(node), base_offset),
                normalized_span: shift_span(Span::from_node(node), base_offset),
                strip_spans: vec![Span::new(identifier_span.start, identifier_span.start + 1)],
            });
        }

        let import_decl = scope.resolve_macro(local_name)?;
        return Some(MacroCandidate {
            kind: candidate_kind_from_arguments(arguments),
            imported_name: import_decl.imported_name.clone(),
            local_name: import_decl.local_name.clone(),
            flavor: MacroFlavor::Direct,
            outer_span: shift_span(Span::from_node(node), base_offset),
            normalized_span: shift_span(Span::from_node(node), base_offset),
            strip_spans: Vec::new(),
        });
    }

    let member_object = function.child_by_field_name("object")?;
    let member_property = function.child_by_field_name("property")?;
    if member_property.kind() != "property_identifier" || text(source, member_property) != "eager" {
        return None;
    }

    let identifier = call_target_identifier(member_object)?;
    let local_name = text(source, identifier);
    let import_decl = scope.resolve_macro(local_name)?;
    let object_span = shift_span(Span::from_node(member_object), base_offset);
    let property_span = shift_span(Span::from_node(member_property), base_offset);

    Some(MacroCandidate {
        kind: candidate_kind_from_arguments(arguments),
        imported_name: import_decl.imported_name.clone(),
        local_name: import_decl.local_name.clone(),
        flavor: MacroFlavor::Eager,
        outer_span: shift_span(Span::from_node(node), base_offset),
        normalized_span: shift_span(
            Span::new(
                object_span.start,
                shift_span(Span::from_node(arguments), base_offset).end,
            ),
            0,
        ),
        strip_spans: vec![Span::new(object_span.end, property_span.end)],
    })
}

fn candidate_kind_from_arguments(arguments: Node<'_>) -> MacroCandidateKind {
    match arguments.kind() {
        "template_string" => MacroCandidateKind::TaggedTemplateExpression,
        _ => MacroCandidateKind::CallExpression,
    }
}

fn call_target_identifier(node: Node<'_>) -> Option<Node<'_>> {
    (node.kind() == "identifier").then_some(node)
}

fn shift_span(span: Span, base_offset: usize) -> Span {
    Span::new(span.start + base_offset, span.end + base_offset)
}

fn text<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}

fn collect_declared_names(node: Node<'_>, source: &str, names: &mut Vec<String>) {
    match node.kind() {
        "variable_declarator" => {
            if let Some(name) = node.child_by_field_name("name") {
                collect_pattern_names(name, source, names);
            }
        }
        "formal_parameters" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                collect_pattern_names(child, source, names);
            }
        }
        "arrow_function" | "function_declaration" | "function_expression" => {
            if let Some(parameters) = node.child_by_field_name("parameters") {
                collect_declared_names(parameters, source, names);
            }
        }
        _ => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                collect_declared_names(child, source, names);
            }
        }
    }
}

fn collect_pattern_names(node: Node<'_>, source: &str, names: &mut Vec<String>) {
    match node.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => {
            names.push(text(source, node).to_string());
        }
        "required_parameter" | "optional_parameter" => {
            if let Some(pattern) = node.child_by_field_name("pattern") {
                collect_pattern_names(pattern, source, names);
            } else if let Some(name) = node.child_by_field_name("name") {
                collect_pattern_names(name, source, names);
            }
        }
        "array_pattern" | "object_pattern" | "assignment_pattern" | "pair_pattern"
        | "rest_pattern" | "formal_parameters" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                collect_pattern_names(child, source, names);
            }
        }
        "pair" => {
            if let Some(value) = node.child_by_field_name("value") {
                collect_pattern_names(value, source, names);
            }
        }
        _ => {}
    }
}
