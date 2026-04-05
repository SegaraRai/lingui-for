use tree_sitter::Node;

use crate::common::{
    NormalizationEdit, ScriptLang, Span, sort_and_dedup_normalization_edits,
    whitespace_replacement_edits,
};

use super::super::shared::helpers::components::first_non_whitespace_child_anchor;
use super::super::shared::helpers::expressions::is_explicit_whitespace_string_expression;
use super::super::shared::helpers::text::{is_component_tag_name, text};
use super::super::shared::js::{BindingParseMode, JsMacroSyntax, collect_macro_candidates};
use super::super::{
    AnalyzeOptions, MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor,
    MacroImport, WhitespaceMode,
};
use super::analysis::{
    CollectContext, declared_names_from_const_tag, declared_names_from_each_start,
    declared_names_from_optional_raw_text, find_first_descendant,
    repair_svelte_expression_inner_span, repair_svelte_raw_expression_span,
};
use super::validation::validate_runtime_lowerable_svelte_component;
use super::{SvelteFrameworkError, SvelteTemplateComponent};

pub(super) fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
) -> Result<Option<SvelteTemplateComponent>, SvelteFrameworkError> {
    let tag = match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag"),
        "self_closing_tag" => Some(node),
        _ => return Ok(None),
    };
    let Some(tag) = tag else {
        return Ok(None);
    };
    let tag_name_node = tag
        .children(&mut tag.walk())
        .find(|child| child.kind() == "tag_name");
    let Some(tag_name_node) = tag_name_node else {
        return Ok(None);
    };
    let tag_name = text(source, tag_name_node);
    if !is_component_tag_name(tag_name) {
        return Ok(None);
    }

    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    if shadowed_names.iter().any(|name| name == tag_name) {
        return Ok(None);
    }

    let import_decl = imports
        .iter()
        .find(|import_decl| import_decl.local_name == tag_name);
    let Some(import_decl) = import_decl else {
        return Ok(None);
    };
    validate_runtime_lowerable_svelte_component(source, node, options)?;
    let mut normalization_edits = Vec::new();
    collect_component_normalization_edits(
        source,
        node,
        imports,
        options,
        context,
        &mut normalization_edits,
    )?;
    sort_and_dedup_normalization_edits(&mut normalization_edits);
    Ok(Some(SvelteTemplateComponent {
        candidate: MacroCandidate {
            id: format!("__mc_{}_{}", node.start_byte(), node.end_byte()),
            kind: MacroCandidateKind::Component,
            imported_name: import_decl.imported_name.clone(),
            local_name: import_decl.local_name.clone(),
            flavor: MacroFlavor::Direct,
            outer_span: Span::from_node(node),
            normalized_span: Span::from_node(node),
            normalization_edits,
            source_map_anchor: component_source_map_anchor(source, node),
            owner_id: None,
            strategy: MacroCandidateStrategy::Standalone,
        },
        shadowed_names,
    }))
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
        let attribute_name = text(source, name_node);
        if let Some(local_name) = attribute_name.strip_prefix("let:") {
            names.push(local_name.to_string());
        }
    }
    names
}

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let org_scope_stack = context.scope_stack.clone();
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_component_normalization_edits_inner(
            source,
            child,
            imports,
            options,
            context,
            normalization_edits,
        )?;
    }
    context.scope_stack = org_scope_stack;
    normalization_edits.extend(component_whitespace_edits(source, node, options));
    Ok(())
}

fn collect_component_normalization_edits_inner(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    match node.kind() {
        "script_element" | "style_element" => return Ok(()),
        "expression" => {
            append_expression_normalization_edits(
                source,
                node,
                imports,
                context,
                normalization_edits,
            )?;
            return Ok(());
        }
        "html_tag" | "render_tag" | "key_start" | "await_start" | "if_start" | "else_if_start" => {
            append_raw_text_expression_normalization_edits(
                source,
                node,
                imports,
                context,
                normalization_edits,
            )?;
        }
        "const_tag" => {
            append_raw_text_expression_normalization_edits(
                source,
                node,
                imports,
                context,
                normalization_edits,
            )?;
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
                collect_component_normalization_edits_inner(
                    source,
                    child,
                    imports,
                    options,
                    context,
                    normalization_edits,
                )?;
            }
            context.scope_stack.pop();
            return Ok(());
        }
        "each_statement" => {
            visit_component_each_statement(
                source,
                node,
                imports,
                options,
                context,
                normalization_edits,
            )?;
            return Ok(());
        }
        "then_block" => {
            visit_component_named_block(
                source,
                node,
                imports,
                options,
                context,
                normalization_edits,
                "then_start",
            )?;
            return Ok(());
        }
        "catch_block" => {
            visit_component_named_block(
                source,
                node,
                imports,
                options,
                context,
                normalization_edits,
                "catch_start",
            )?;
            return Ok(());
        }
        "snippet_statement" => {
            visit_component_snippet_statement(
                source,
                node,
                imports,
                options,
                context,
                normalization_edits,
            )?;
            return Ok(());
        }
        "element" | "self_closing_tag" => {
            visit_component_element_like(
                source,
                node,
                imports,
                options,
                context,
                normalization_edits,
            )?;
            return Ok(());
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_component_normalization_edits_inner(
            source,
            child,
            imports,
            options,
            context,
            normalization_edits,
        )?;
    }
    Ok(())
}

fn append_expression_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "svelte_raw_text")
    else {
        return Ok(());
    };
    let inner_span = repair_svelte_expression_inner_span(source, node, Span::from_node(raw_text));

    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let expression_source = &source[inner_span.start..inner_span.end];
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;

    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        &shadowed_names,
    );
    normalization_edits.extend(
        candidates
            .into_iter()
            .flat_map(|candidate| candidate.normalization_edits.into_iter()),
    );
    Ok(())
}

fn append_raw_text_expression_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = find_first_descendant(node, "svelte_raw_text") else {
        return Ok(());
    };

    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let inner_span = repair_svelte_raw_expression_span(source, Span::from_node(raw_text));
    let expression_source = &source[inner_span.start..inner_span.end];
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;
    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        &shadowed_names,
    );
    normalization_edits.extend(
        candidates
            .into_iter()
            .flat_map(|candidate| candidate.normalization_edits.into_iter()),
    );
    match node.kind() {
        "html_tag" => append_virtual_trans_child_wrapper_edits(
            source,
            node,
            inner_span,
            "LinguiForSvelteHtml",
            normalization_edits,
        ),
        "render_tag" => append_virtual_trans_child_wrapper_edits(
            source,
            node,
            inner_span,
            "LinguiForSvelteRender",
            normalization_edits,
        ),
        _ => {}
    }
    Ok(())
}

fn append_virtual_trans_child_wrapper_edits(
    _source: &str,
    node: Node<'_>,
    inner_span: Span,
    tag_name: &str,
    normalization_edits: &mut Vec<NormalizationEdit>,
) {
    let outer_span = Span::from_node(node);
    if inner_span.start < outer_span.start || inner_span.end > outer_span.end {
        return;
    }

    if outer_span.start < inner_span.start {
        normalization_edits.push(NormalizationEdit::Delete {
            span: Span::new(outer_span.start, inner_span.start),
        });
    }
    normalization_edits.push(NormalizationEdit::Insert {
        at: outer_span.start,
        text: format!("<{tag_name} value={{"),
    });

    if inner_span.end < outer_span.end {
        normalization_edits.push(NormalizationEdit::Delete {
            span: Span::new(inner_span.end, outer_span.end),
        });
    }
    normalization_edits.push(NormalizationEdit::Insert {
        at: inner_span.end,
        text: "} />".to_string(),
    });
}

fn visit_component_each_statement(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let start = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "each_start");
    if let Some(start) = start {
        append_raw_text_expression_normalization_edits(
            source,
            start,
            imports,
            context,
            normalization_edits,
        )?;
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
        collect_component_normalization_edits_inner(
            source,
            child,
            imports,
            options,
            context,
            normalization_edits,
        )?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_component_named_block(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
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
        collect_component_normalization_edits_inner(
            source,
            child,
            imports,
            options,
            context,
            normalization_edits,
        )?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_component_snippet_statement(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
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
        collect_component_normalization_edits_inner(
            source,
            child,
            imports,
            options,
            context,
            normalization_edits,
        )?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_component_element_like(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    if let Some(candidate) =
        component_candidate_from_element(source, node, imports, options, context)?
    {
        normalization_edits.extend(candidate.candidate.normalization_edits);
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
        collect_component_normalization_edits_inner(
            source,
            child,
            imports,
            options,
            context,
            normalization_edits,
        )?;
    }

    if has_let_bindings {
        context.scope_stack.pop();
    }
    Ok(())
}

fn component_source_map_anchor(source: &str, node: Node<'_>) -> Option<Span> {
    if node.kind() != "element" {
        return Some(Span::from_node(node));
    }

    first_non_whitespace_child_anchor(source, node, &["start_tag", "end_tag"])
        .or(Some(Span::from_node(node)))
}

fn component_whitespace_edits(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Vec<NormalizationEdit> {
    if options.whitespace == WhitespaceMode::Jsx || node.kind() != "element" {
        return Vec::new();
    }

    let mut content_children = Vec::new();
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if matches!(child.kind(), "start_tag" | "end_tag") {
            continue;
        }
        content_children.push(child);
    }

    whitespace_replacement_edits(source, &content_children, is_explicit_space_expression)
}

fn is_explicit_space_expression(source: &str, node: Node<'_>) -> bool {
    let text = source[Span::from_node(node).start..Span::from_node(node).end].trim();
    is_explicit_whitespace_string_expression(text)
}
