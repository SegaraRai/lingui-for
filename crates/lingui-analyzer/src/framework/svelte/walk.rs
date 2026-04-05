use tree_sitter::Node;

use crate::common::ScriptLang;

use super::super::AnalyzeOptions;
use super::super::shared::js::{
    BindingParseMode, ExpressionParseCache, collect_declared_names_from_binding_source,
};
use super::SvelteFrameworkError;

#[derive(Debug, Default)]
pub(super) struct TemplateWalkContext {
    pub(super) scope_stack: Vec<Vec<String>>,
    pub(super) expression_parse_cache: ExpressionParseCache,
}

impl TemplateWalkContext {
    pub(super) fn shadowed_names(&self) -> impl Iterator<Item = &String> {
        self.scope_stack.iter().flat_map(|frame| frame.iter())
    }
}

pub(super) trait SvelteTemplateVisitor {
    type Output;

    fn visit_expression(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError>;

    fn visit_raw_text_expression(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError>;

    fn visit_each_start(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError>;

    fn visit_element_like(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<bool, SvelteFrameworkError>;

    fn finish(self) -> Self::Output;
}

pub(super) fn walk_svelte_template<V: SvelteTemplateVisitor>(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
    context: &mut TemplateWalkContext,
    visitor: &mut V,
) -> Result<(), SvelteFrameworkError> {
    match node.kind() {
        "script_element" | "style_element" => return Ok(()),
        "expression" => {
            visitor.visit_expression(source, node, context)?;
            return Ok(());
        }
        "html_tag" | "render_tag" | "key_start" | "await_start" | "if_start" | "else_if_start" => {
            visitor.visit_raw_text_expression(source, node, context)?;
        }
        "const_tag" => {
            visitor.visit_raw_text_expression(source, node, context)?;
            let names = declared_names_from_const_tag(source, node)?;
            if !names.is_empty() {
                if let Some(frame) = context.scope_stack.last_mut() {
                    frame.extend(names);
                } else {
                    context.scope_stack.push(names);
                }
            }
            return Ok(());
        }
        "if_statement" | "else_block" | "else_if_block" | "key_statement" => {
            context.scope_stack.push(Vec::new());
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                walk_svelte_template(source, child, options, context, visitor)?;
            }
            context.scope_stack.pop();
            return Ok(());
        }
        "each_statement" => {
            visit_each_statement(source, node, options, context, visitor)?;
            return Ok(());
        }
        "then_block" => {
            visit_named_block(source, node, options, context, visitor, "then_start")?;
            return Ok(());
        }
        "catch_block" => {
            visit_named_block(source, node, options, context, visitor, "catch_start")?;
            return Ok(());
        }
        "snippet_statement" => {
            visit_snippet_statement(source, node, options, context, visitor)?;
            return Ok(());
        }
        "element" | "self_closing_tag" => {
            if visitor.visit_element_like(source, node, context)? {
                return Ok(());
            }

            let let_bindings = let_bindings_from_element(source, node);
            let has_let_bindings = !let_bindings.is_empty();
            if has_let_bindings {
                context.scope_stack.push(let_bindings);
            }

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if node.kind() == "element" && child.kind() == "end_tag" {
                    continue;
                }
                walk_svelte_template(source, child, options, context, visitor)?;
            }

            if has_let_bindings {
                context.scope_stack.pop();
            }
            return Ok(());
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        walk_svelte_template(source, child, options, context, visitor)?;
    }
    Ok(())
}

fn visit_each_statement<V: SvelteTemplateVisitor>(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
    context: &mut TemplateWalkContext,
    visitor: &mut V,
) -> Result<(), SvelteFrameworkError> {
    let start = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "each_start");
    if let Some(start) = start {
        visitor.visit_each_start(source, start, context)?;
    }
    let frame = start
        .map(|start| declared_names_from_each_start(source, start))
        .transpose()?
        .unwrap_or_default();

    context.scope_stack.push(frame);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "each_start" || child.kind() == "each_end" {
            continue;
        }
        walk_svelte_template(source, child, options, context, visitor)?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_named_block<V: SvelteTemplateVisitor>(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
    context: &mut TemplateWalkContext,
    visitor: &mut V,
    start_kind: &str,
) -> Result<(), SvelteFrameworkError> {
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

    context.scope_stack.push(frame);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == start_kind {
            continue;
        }
        walk_svelte_template(source, child, options, context, visitor)?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_snippet_statement<V: SvelteTemplateVisitor>(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
    context: &mut TemplateWalkContext,
    visitor: &mut V,
) -> Result<(), SvelteFrameworkError> {
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

    context.scope_stack.push(frame);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "snippet_start" || child.kind() == "snippet_end" {
            continue;
        }
        walk_svelte_template(source, child, options, context, visitor)?;
    }
    context.scope_stack.pop();
    Ok(())
}

pub(super) fn let_bindings_from_element(source: &str, node: Node<'_>) -> Vec<String> {
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
        let attribute_name = super::super::shared::helpers::text::text(source, name_node);
        if let Some(local_name) = attribute_name.strip_prefix("let:") {
            names.push(local_name.to_string());
        }
    }
    names
}

pub(super) fn declared_names_from_const_tag(
    source: &str,
    node: Node<'_>,
) -> Result<Vec<String>, SvelteFrameworkError> {
    declared_names_from_optional_raw_text(source, node, BindingParseMode::VariableDeclarator)
        .map(|names| names.unwrap_or_default())
}

pub(super) fn declared_names_from_each_start(
    source: &str,
    node: Node<'_>,
) -> Result<Vec<String>, SvelteFrameworkError> {
    let Some(parameter) = node.child_by_field_name("parameter") else {
        return Ok(Vec::new());
    };
    Ok(collect_declared_names_from_binding_source(
        super::super::shared::helpers::text::text(source, parameter),
        BindingParseMode::FunctionParams,
        ScriptLang::Ts,
    )?)
}

pub(super) fn declared_names_from_optional_raw_text(
    source: &str,
    node: Node<'_>,
    mode: BindingParseMode,
) -> Result<Option<Vec<String>>, SvelteFrameworkError> {
    let raw_text = find_first_descendant(node, "svelte_raw_text");
    let Some(raw_text) = raw_text else {
        return Ok(None);
    };
    let names = collect_declared_names_from_binding_source(
        super::super::shared::helpers::text::text(source, raw_text),
        mode,
        ScriptLang::Ts,
    )?;
    Ok(Some(names))
}

pub(super) fn find_first_descendant<'a>(node: Node<'a>, kind: &str) -> Option<Node<'a>> {
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
