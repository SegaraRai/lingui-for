use std::collections::HashMap;

use lean_string::LeanString;
use tree_sitter::{Node, Tree};

use crate::common::{NormalizationEdit, ScriptLang, Span};
use crate::framework::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
};
use crate::syntax::parse::ParseError;

use super::helpers::text::text;
use super::scope::LexicalScope;

#[derive(thiserror::Error, Debug)]
pub enum JsAnalysisError {
    #[error(transparent)]
    Parse(#[from] ParseError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsMacroSyntax {
    Standard,
    Svelte,
}

pub fn collect_macro_candidates<I, S>(
    source: &str,
    root: Node<'_>,
    imports: &[MacroImport],
    base_offset: usize,
    syntax: JsMacroSyntax,
    shadowed_names: I,
) -> Vec<MacroCandidate>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut scope = LexicalScope::new(imports.iter().cloned());
    scope.declare_many(
        shadowed_names
            .into_iter()
            .map(|name| name.as_ref().to_string()),
    );
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
    language: ScriptLang,
) -> Result<Vec<LeanString>, JsAnalysisError> {
    let wrapped = match mode {
        BindingParseMode::VariableDeclarator => format!("const {source};"),
        BindingParseMode::FunctionParams => format!("function __lf({source}) {{}}"),
        BindingParseMode::SingleParam => format!("(({source}) => 0)"),
    };

    let tree = language.parse(&wrapped)?;
    let root = tree.root_node();
    let mut names = Vec::new();
    collect_declared_names(root, &wrapped, &mut names);
    Ok(names)
}

pub fn collect_top_level_declared_names_from_root(source: &str, root: Node<'_>) -> Vec<LeanString> {
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

    names.sort_unstable();
    names.dedup();
    names
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExpressionParseKey {
    start: usize,
    end: usize,
    language: ScriptLang,
}

#[derive(Debug, Default)]
pub struct ExpressionParseCache {
    trees: HashMap<ExpressionParseKey, Tree>,
}

impl ExpressionParseCache {
    pub fn parse(
        &mut self,
        source: &str,
        span: Span,
        language: ScriptLang,
    ) -> Result<Tree, ParseError> {
        let key = ExpressionParseKey {
            start: span.start,
            end: span.end,
            language,
        };
        if let Some(tree) = self.trees.get(&key) {
            return Ok(tree.clone());
        }

        let slice = &source[span.start..span.end];
        let tree = language.parse(slice)?;
        self.trees.insert(key, tree.clone());
        Ok(tree)
    }
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
            let identifier_span = Span::from_node(identifier).shifted(base_offset);
            Some(MacroCandidate {
                id: LeanString::new(),
                kind: candidate_kind_from_arguments(arguments),
                imported_name: import_decl.imported_name.clone(),
                local_name: import_decl.local_name.clone(),
                flavor: MacroFlavor::Direct,
                outer_span: Span::from_node(node).shifted(base_offset),
                normalized_span: Span::from_node(node).shifted(base_offset),
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
            let outer_span = Span::from_node(node).shifted(base_offset);
            let identifier_span = Span::from_node(identifier).shifted(base_offset);
            let anchor = Span::new(identifier_span.start + 1, identifier_span.end);

            return Some(MacroCandidate {
                id: LeanString::new(),
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
            id: LeanString::new(),
            kind: candidate_kind_from_arguments(arguments),
            imported_name: import_decl.imported_name.clone(),
            local_name: import_decl.local_name.clone(),
            flavor: MacroFlavor::Direct,
            outer_span: Span::from_node(node).shifted(base_offset),
            normalized_span: Span::from_node(node).shifted(base_offset),
            normalization_edits: Vec::new(),
            source_map_anchor: Some(Span::from_node(identifier).shifted(base_offset)),
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
    let object_span = Span::from_node(member_object).shifted(base_offset);
    let property_span = Span::from_node(member_property).shifted(base_offset);
    let outer_span = Span::new(
        object_span.start,
        Span::from_node(node).shifted(base_offset).end,
    );

    Some(MacroCandidate {
        id: LeanString::new(),
        kind: candidate_kind_from_arguments(arguments),
        imported_name: import_decl.imported_name.clone(),
        local_name: import_decl.local_name.clone(),
        flavor: MacroFlavor::Eager,
        outer_span,
        normalized_span: Span::new(
            object_span.start,
            Span::from_node(arguments).shifted(base_offset).end,
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

fn assign_candidate_ownership(mut candidates: Vec<MacroCandidate>) -> Vec<MacroCandidate> {
    candidates.sort_by_key(|candidate| {
        (
            candidate.outer_span.start,
            std::cmp::Reverse(candidate.outer_span.end),
        )
    });

    let mut planned = Vec::with_capacity(candidates.len());
    for mut candidate in candidates {
        candidate.id = LeanString::from(format!(
            "__mc_{}_{}",
            candidate.outer_span.start, candidate.outer_span.end
        ));

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

fn collect_declared_names(node: Node<'_>, source: &str, names: &mut Vec<LeanString>) {
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

fn collect_import_declared_names(node: Node<'_>, source: &str, names: &mut Vec<LeanString>) {
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

fn collect_pattern_names(node: Node<'_>, source: &str, names: &mut Vec<LeanString>) {
    match node.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => {
            names.push(LeanString::from(text(source, node)));
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

#[cfg(test)]
mod tests {
    use lean_string::LeanString;

    use crate::common::Span;
    use crate::framework::MacroImport;
    use crate::syntax::parse::parse_typescript;

    use super::{JsMacroSyntax, collect_macro_candidates};

    #[test]
    fn does_not_duplicate_standard_call_candidates_inside_conditionals() {
        let source = "control.placeholder ? t(control.placeholder) : undefined";
        let imports = vec![MacroImport {
            source: LeanString::from("lingui-for-astro/macro"),
            imported_name: LeanString::from("t"),
            local_name: LeanString::from("t"),
            span: Span::new(0, 0),
        }];

        let tree = parse_typescript(source).expect("parse succeeds");
        let candidates = collect_macro_candidates(
            source,
            tree.root_node(),
            &imports,
            0,
            JsMacroSyntax::Standard,
            std::iter::empty::<&str>(),
        );

        assert_eq!(candidates.len(), 1);
        assert_eq!(
            &source[candidates[0].outer_span.start..candidates[0].outer_span.end],
            "t(control.placeholder)"
        );
    }
}
