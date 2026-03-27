use tree_sitter::Node;

use crate::common::Span;

use super::parse::{parse_javascript, parse_typescript};
use super::scope::LexicalScope;
use super::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
    NormalizationEdit,
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
        JsLikeLanguage::JavaScript => parse_javascript(source)?,
        JsLikeLanguage::TypeScript => parse_typescript(source)?,
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
    assign_candidate_ownership(candidates)
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
        JsLikeLanguage::JavaScript => parse_javascript(&wrapped)?,
        JsLikeLanguage::TypeScript => parse_typescript(&wrapped)?,
    };
    let root = tree.root_node();
    let mut names = Vec::new();
    collect_declared_names(root, &wrapped, &mut names);
    Ok(names)
}

pub fn collect_top_level_declared_names_in_javascript(
    source: &str,
    language: JsLikeLanguage,
) -> Result<Vec<String>, crate::AnalyzerError> {
    let tree = match language {
        JsLikeLanguage::JavaScript => parse_javascript(source)?,
        JsLikeLanguage::TypeScript => parse_typescript(source)?,
    };
    let root = tree.root_node();
    let mut names = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        match child.kind() {
            "import_statement" => collect_import_declared_names(child, source, &mut names),
            "lexical_declaration" | "variable_declaration" => {
                let mut decl_cursor = child.walk();
                for declarator in child.children(&mut decl_cursor) {
                    if declarator.kind() != "variable_declarator" {
                        continue;
                    }
                    if let Some(name) = declarator.child_by_field_name("name") {
                        collect_pattern_names(name, source, &mut names);
                    }
                }
            }
            "function_declaration" | "generator_function_declaration" | "class_declaration" => {
                if let Some(name) = child.child_by_field_name("name") {
                    collect_pattern_names(name, source, &mut names);
                }
            }
            _ => {}
        }
    }

    names.sort();
    names.dedup();
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
            let identifier_span = shift_span(Span::from_node(identifier), base_offset);
            Some(MacroCandidate {
                id: String::new(),
                kind: candidate_kind_from_arguments(arguments),
                imported_name: import_decl.imported_name.clone(),
                local_name: import_decl.local_name.clone(),
                flavor: MacroFlavor::Direct,
                outer_span: shift_span(Span::from_node(node), base_offset),
                normalized_span: shift_span(Span::from_node(node), base_offset),
                normalization_edits: Vec::new(),
                source_map_anchor: Some(identifier_span),
                owner_id: None,
                strategy: MacroCandidateStrategy::Standalone,
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
            let (outer_span, identifier_span) = repair_svelte_reactive_spans(
                source,
                base_offset,
                Span::from_node(node),
                Span::from_node(identifier),
                &import_decl.local_name,
            );
            let anchor = Span::new(identifier_span.start + 1, identifier_span.end);

            return Some(MacroCandidate {
                id: String::new(),
                kind: candidate_kind_from_arguments(arguments),
                imported_name: import_decl.imported_name.clone(),
                local_name: import_decl.local_name.clone(),
                flavor: MacroFlavor::Reactive,
                outer_span,
                normalized_span: outer_span,
                normalization_edits: vec![NormalizationEdit::Delete {
                    span: Span::new(identifier_span.start, identifier_span.start + 1),
                }],
                source_map_anchor: Some(anchor),
                owner_id: None,
                strategy: MacroCandidateStrategy::Standalone,
            });
        }

        let import_decl = scope.resolve_macro(local_name)?;
        return Some(MacroCandidate {
            id: String::new(),
            kind: candidate_kind_from_arguments(arguments),
            imported_name: import_decl.imported_name.clone(),
            local_name: import_decl.local_name.clone(),
            flavor: MacroFlavor::Direct,
            outer_span: shift_span(Span::from_node(node), base_offset),
            normalized_span: shift_span(Span::from_node(node), base_offset),
            normalization_edits: Vec::new(),
            source_map_anchor: Some(shift_span(Span::from_node(identifier), base_offset)),
            owner_id: None,
            strategy: MacroCandidateStrategy::Standalone,
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
    let (outer_span, object_span, property_span) = repair_svelte_eager_spans(
        source,
        base_offset,
        Span::from_node(node),
        Span::from_node(member_object),
        Span::from_node(member_property),
        local_name,
    );

    Some(MacroCandidate {
        id: String::new(),
        kind: candidate_kind_from_arguments(arguments),
        imported_name: import_decl.imported_name.clone(),
        local_name: import_decl.local_name.clone(),
        flavor: MacroFlavor::Eager,
        outer_span,
        normalized_span: Span::new(
            object_span.start,
            shift_span(Span::from_node(arguments), base_offset).end,
        ),
        normalization_edits: vec![NormalizationEdit::Delete {
            span: Span::new(object_span.end, property_span.end),
        }],
        source_map_anchor: Some(object_span),
        owner_id: None,
        strategy: MacroCandidateStrategy::Standalone,
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

fn repair_svelte_reactive_spans(
    source: &str,
    base_offset: usize,
    outer: Span,
    _identifier: Span,
    local_name: &str,
) -> (Span, Span) {
    let pattern = format!("${local_name}");
    let repaired_start =
        find_pattern_near_start(source, outer.start, outer.end, &pattern).unwrap_or(outer.start);
    let repaired_identifier = Span::new(repaired_start, repaired_start + pattern.len());
    (
        shift_span(Span::new(repaired_start, outer.end), base_offset),
        shift_span(repaired_identifier, base_offset),
    )
}

fn repair_svelte_eager_spans(
    source: &str,
    base_offset: usize,
    outer: Span,
    _object: Span,
    _property: Span,
    local_name: &str,
) -> (Span, Span, Span) {
    let pattern = format!("{local_name}.eager");
    let repaired_start =
        find_pattern_near_start(source, outer.start, outer.end, &pattern).unwrap_or(outer.start);
    let repaired_object = Span::new(repaired_start, repaired_start + local_name.len());
    let repaired_property = Span::new(
        repaired_start + local_name.len() + 1,
        repaired_start + pattern.len(),
    );
    (
        shift_span(Span::new(repaired_start, outer.end), base_offset),
        shift_span(repaired_object, base_offset),
        shift_span(repaired_property, base_offset),
    )
}

fn find_pattern_near_start(
    source: &str,
    current_start: usize,
    current_end: usize,
    pattern: &str,
) -> Option<usize> {
    let window_start =
        clamp_to_char_boundary_floor(source, current_start.saturating_sub(pattern.len() + 8));
    let window_end = clamp_to_char_boundary_ceil(source, current_end.min(source.len()));
    source[window_start..window_end]
        .match_indices(pattern)
        .map(|(offset, _)| window_start + offset)
        .filter(|start| *start <= current_start)
        .max()
}

fn clamp_to_char_boundary_floor(source: &str, mut index: usize) -> usize {
    index = index.min(source.len());
    while index > 0 && !source.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn clamp_to_char_boundary_ceil(source: &str, mut index: usize) -> usize {
    index = index.min(source.len());
    while index < source.len() && !source.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn assign_candidate_ownership(mut candidates: Vec<MacroCandidate>) -> Vec<MacroCandidate> {
    candidates.sort_by_key(|candidate| {
        (
            candidate.outer_span.start,
            std::cmp::Reverse(candidate.outer_span.end),
        )
    });

    let mut planned = Vec::with_capacity(candidates.len());
    for mut candidate in candidates {
        candidate.id = format!(
            "__mc_{}_{}",
            candidate.outer_span.start, candidate.outer_span.end
        );

        if let Some(owner) = planned.iter().find(|kept: &&MacroCandidate| {
            kept.outer_span.start <= candidate.outer_span.start
                && kept.outer_span.end >= candidate.outer_span.end
        }) {
            candidate.owner_id = Some(owner.id.clone());
            candidate.strategy = MacroCandidateStrategy::OwnedByParent;
        }
        planned.push(candidate);
    }

    planned.sort_by_key(|candidate| (candidate.outer_span.start, candidate.outer_span.end));
    planned
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

fn collect_import_declared_names(node: Node<'_>, source: &str, names: &mut Vec<String>) {
    match node.kind() {
        "import_specifier" => {
            if let Some(alias) = node.child_by_field_name("alias") {
                collect_pattern_names(alias, source, names);
            } else if let Some(name) = node.child_by_field_name("name") {
                collect_pattern_names(name, source, names);
            }
            return;
        }
        "namespace_import" => {
            if let Some(name) = node.child_by_field_name("name") {
                collect_pattern_names(name, source, names);
            }
            return;
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "identifier" && node.kind() == "import_clause" {
            collect_pattern_names(child, source, names);
        } else {
            collect_import_declared_names(child, source, names);
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
