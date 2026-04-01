use std::borrow::Cow;

use tree_sitter::Node;

use crate::common::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
use crate::conventions::FrameworkConventions;

use super::anchors::{collect_node_start_anchors, extend_shifted_node_start_anchors};
use super::expression::is_explicit_whitespace_string_expression;
use super::js::{
    BindingParseMode, JsAnalysisError, JsLikeLanguage, JsMacroSyntax,
    collect_declared_names_from_binding_source, collect_macro_candidates_in_javascript,
    collect_top_level_declared_names_in_javascript,
};
use super::parse::{ParseError, parse_javascript, parse_svelte, parse_typescript};
use super::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, MacroCandidate, MacroCandidateKind,
    MacroCandidateStrategy, MacroFlavor, MacroImport, NormalizationEdit, WhitespaceMode,
};

#[derive(thiserror::Error, Debug)]
pub enum SvelteFrameworkError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error("script element should have start tag")]
    MissingScriptStartTag,
    #[error(
        "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations."
    )]
    BareDirectTNotAllowed,
    #[error(
        "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
    )]
    BareDirectMacroRequiresReactiveOrEager { imported_name: Cow<'static, str> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptAnalysis {
    pub scripts: Vec<SvelteScriptBlock>,
    pub template_expressions: Vec<SvelteTemplateExpression>,
    pub template_components: Vec<SvelteTemplateComponent>,
    pub source_anchors: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvelteScriptBlock {
    pub region: EmbeddedScriptRegion,
    pub is_module: bool,
    pub is_typescript: bool,
    pub declared_names: Vec<String>,
    pub macro_imports: Vec<MacroImport>,
    pub macro_import_statement_spans: Vec<Span>,
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

    fn analyze(
        &self,
        source: &str,
        options: &AnalyzeOptions,
    ) -> Result<Self::Analysis, FrameworkError> {
        Ok(analyze_svelte(source, options)?)
    }
}

fn analyze_svelte(
    source: &str,
    options: &AnalyzeOptions,
) -> Result<SvelteScriptAnalysis, SvelteFrameworkError> {
    let tree = parse_svelte(source)?;
    let root = tree.root_node();
    let mut source_anchors = collect_node_start_anchors(source, root);
    let mut scripts = collect_script_blocks(source, root, options, &mut source_anchors)?;
    let template_imports = scripts
        .iter()
        .filter(|script| !script.is_module)
        .flat_map(|script| script.macro_imports.iter().cloned())
        .collect::<Vec<_>>();
    let mut template_shadowed_names = scripts
        .iter()
        .filter(|script| !script.is_module)
        .flat_map(|script| script.declared_names.iter().cloned())
        .filter(|name| {
            !template_imports
                .iter()
                .any(|import_decl| import_decl.local_name == *name)
        })
        .collect::<Vec<_>>();
    template_shadowed_names.sort();
    template_shadowed_names.dedup();
    let mut context = CollectContext {
        scope_stack: vec![template_shadowed_names],
        expressions: Vec::new(),
        components: Vec::new(),
    };
    collect_template_expressions(source, root, &template_imports, options, &mut context)?;
    for script in &mut scripts {
        repair_svelte_candidates(source, &mut script.candidates);
    }
    for expression in &mut context.expressions {
        repair_svelte_candidates(source, &mut expression.candidates);
    }
    Ok(SvelteScriptAnalysis {
        scripts,
        template_expressions: context.expressions,
        template_components: context.components,
        source_anchors,
    })
}

fn collect_script_blocks(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
    source_anchors: &mut Vec<usize>,
) -> Result<Vec<SvelteScriptBlock>, SvelteFrameworkError> {
    fn collect_script_blocks_impl(
        source: &str,
        node: Node<'_>,
        options: &AnalyzeOptions,
        source_anchors: &mut Vec<usize>,
        scripts: &mut Vec<SvelteScriptBlock>,
    ) -> Result<(), SvelteFrameworkError> {
        if node.kind() == "script_element" {
            if let Some(script) = analyze_script_block(source, node, options, source_anchors)? {
                scripts.push(script);
            }
            return Ok(());
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            collect_script_blocks_impl(source, child, options, source_anchors, scripts)?;
        }
        Ok(())
    }

    let mut scripts = Vec::new();
    collect_script_blocks_impl(source, node, options, source_anchors, &mut scripts)?;

    Ok(scripts)
}

fn analyze_script_block(
    source: &str,
    script_element: Node<'_>,
    options: &AnalyzeOptions,
    source_anchors: &mut Vec<usize>,
) -> Result<Option<SvelteScriptBlock>, SvelteFrameworkError> {
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
    let start_tag = start_tag.ok_or(SvelteFrameworkError::MissingScriptStartTag)?;
    let content_region = EmbeddedScriptRegion {
        kind: EmbeddedScriptKind::Script,
        outer_span: Span::from_node(script_element),
        inner_span: Span::from_node(raw_text),
    };

    let script_source = &source[content_region.inner_span.start..content_region.inner_span.end];
    let language = script_language(source, start_tag);
    let script_tree = match language {
        JsLikeLanguage::JavaScript => parse_javascript(script_source)?,
        JsLikeLanguage::TypeScript => parse_typescript(script_source)?,
    };
    extend_shifted_node_start_anchors(
        script_source,
        script_tree.root_node(),
        content_region.inner_span.start,
        source_anchors,
    );
    let declared_names = collect_top_level_declared_names_in_javascript(script_source, language)?;
    let macro_imports = collect_script_macro_imports(
        script_source,
        content_region.inner_span.start,
        language,
        &options.conventions,
    )?;
    let macro_import_statement_spans = collect_script_macro_import_statement_spans(
        script_source,
        content_region.inner_span.start,
        language,
        &options.conventions,
    )?
    .into_iter()
    .map(|span| expand_import_removal_span_in_source(source, span))
    .collect();
    let candidates = collect_macro_candidates_in_javascript(
        script_source,
        &macro_imports,
        content_region.inner_span.start,
        JsMacroSyntax::Svelte,
        language,
        &[],
    )?;

    Ok(Some(SvelteScriptBlock {
        region: content_region,
        is_module: start_tag_has_context_module(source, start_tag),
        is_typescript: language == JsLikeLanguage::TypeScript,
        declared_names,
        macro_imports,
        macro_import_statement_spans,
        candidates,
    }))
}

struct CollectContext {
    scope_stack: Vec<Vec<String>>,
    expressions: Vec<SvelteTemplateExpression>,
    components: Vec<SvelteTemplateComponent>,
}

fn collect_template_expressions(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
) -> Result<(), SvelteFrameworkError> {
    match node.kind() {
        "script_element" | "style_element" => return Ok(()),
        "expression" => {
            push_expression(source, node, imports, context)?;
            return Ok(());
        }
        "html_tag" | "render_tag" | "key_start" | "await_start" | "if_start" | "else_if_start" => {
            push_raw_text_expression(source, node, imports, context)?;
        }
        "const_tag" => {
            push_raw_text_expression(source, node, imports, context)?;
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
                collect_template_expressions(source, child, imports, options, context)?;
            }
            context.scope_stack.pop();
            return Ok(());
        }
        "each_statement" => {
            visit_each_statement(source, node, imports, options, context)?;
            return Ok(());
        }
        "then_block" => {
            visit_named_block(source, node, imports, options, context, "then_start")?;
            return Ok(());
        }
        "catch_block" => {
            visit_named_block(source, node, imports, options, context, "catch_start")?;
            return Ok(());
        }
        "snippet_statement" => {
            visit_snippet_statement(source, node, imports, options, context)?;
            return Ok(());
        }
        "element" | "self_closing_tag" => {
            visit_element_like(source, node, imports, options, context)?;
            return Ok(());
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_template_expressions(source, child, imports, options, context)?;
    }
    Ok(())
}

fn push_expression(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    context: &mut CollectContext,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "svelte_raw_text")
    else {
        return Ok(());
    };
    let inner_span = repair_svelte_expression_inner_span(source, node, Span::from_node(raw_text));
    let outer_span = Span::from_node(node);
    let expression_source = &source[inner_span.start..inner_span.end];
    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let candidates = collect_macro_candidates_in_javascript(
        expression_source,
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        // Svelte template expressions accept TypeScript syntax such as `as` and `satisfies`.
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    context.expressions.push(SvelteTemplateExpression {
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
    context: &mut CollectContext,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = find_first_descendant(node, "svelte_raw_text") else {
        return Ok(());
    };

    let inner_span = repair_svelte_raw_expression_span(source, Span::from_node(raw_text));
    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let candidates = collect_macro_candidates_in_javascript(
        text(source, raw_text),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    context.expressions.push(SvelteTemplateExpression {
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
    options: &AnalyzeOptions,
    context: &mut CollectContext,
) -> Result<(), SvelteFrameworkError> {
    let start = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "each_start");
    if let Some(start) = start {
        push_each_start_expression(source, start, imports, context)?;
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
        collect_template_expressions(source, child, imports, options, context)?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn push_each_start_expression(
    source: &str,
    each_start: Node<'_>,
    imports: &[MacroImport],
    context: &mut CollectContext,
) -> Result<(), SvelteFrameworkError> {
    let Some(identifier) = each_start.child_by_field_name("identifier") else {
        return Ok(());
    };

    let inner_span = Span::from_node(identifier);
    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    let candidates = collect_macro_candidates_in_javascript(
        text(source, identifier),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    context.expressions.push(SvelteTemplateExpression {
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
    options: &AnalyzeOptions,
    context: &mut CollectContext,
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
        collect_template_expressions(source, child, imports, options, context)?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_snippet_statement(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
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
        collect_template_expressions(source, child, imports, options, context)?;
    }
    context.scope_stack.pop();
    Ok(())
}

fn visit_element_like(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
) -> Result<(), SvelteFrameworkError> {
    if let Some(candidate) =
        component_candidate_from_element(source, node, imports, options, context)
    {
        context.components.push(candidate);
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
        collect_template_expressions(source, child, imports, options, context)?;
    }

    if has_let_bindings {
        context.scope_stack.pop();
    }
    Ok(())
}

fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
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

    let shadowed_names = context
        .scope_stack
        .iter()
        .flat_map(|frame| frame.iter().cloned())
        .collect::<Vec<_>>();
    if shadowed_names.iter().any(|name| name == tag_name) {
        return None;
    }

    let import_decl = imports
        .iter()
        .find(|import_decl| import_decl.local_name == tag_name)?;
    let mut normalization_edits = Vec::new();
    collect_component_normalization_edits(
        source,
        node,
        imports,
        options,
        context,
        &mut normalization_edits,
    )
    .ok()?;
    sort_and_dedup_normalization_edits(&mut normalization_edits);
    Some(SvelteTemplateComponent {
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
    })
}

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut CollectContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    // Restore the original scope stack after walking this component because
    // `{#const ...}` mutates the current frame; without this, names declared
    // inside the component would incorrectly shadow imports in later siblings.
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
    context: &CollectContext,
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
    let candidates = collect_macro_candidates_in_javascript(
        &source[inner_span.start..inner_span.end],
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
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
    context: &CollectContext,
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
    let candidates = collect_macro_candidates_in_javascript(
        &source[inner_span.start..inner_span.end],
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        JsLikeLanguage::TypeScript,
        &shadowed_names,
    )?;
    normalization_edits.extend(
        candidates
            .into_iter()
            .flat_map(|candidate| candidate.normalization_edits.into_iter()),
    );
    Ok(())
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
        component_candidate_from_element(source, node, imports, options, context)
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

    whitespace_replacement_edits(source, &content_children)
}

fn whitespace_replacement_edits(source: &str, children: &[Node<'_>]) -> Vec<NormalizationEdit> {
    let mut edits = Vec::new();
    let meaningful_children = children
        .iter()
        .copied()
        .filter(|child| {
            let span = Span::from_node(*child);
            !source[span.start..span.end].trim().is_empty()
        })
        .collect::<Vec<_>>();

    for pair in meaningful_children.windows(2) {
        let previous = pair[0];
        let next = pair[1];
        if is_explicit_space_expression(source, previous)
            || is_explicit_space_expression(source, next)
        {
            continue;
        }
        let gap = Span::new(previous.end_byte(), next.start_byte());
        if gap.start >= gap.end {
            continue;
        }
        if !source[gap.start..gap.end].trim().is_empty() {
            continue;
        }

        edits.push(NormalizationEdit::Delete { span: gap });
        edits.push(NormalizationEdit::Insert {
            at: gap.start,
            text: "{\" \"}".to_string(),
        });
    }

    edits
}

fn is_explicit_space_expression(source: &str, node: Node<'_>) -> bool {
    let text = source[Span::from_node(node).start..Span::from_node(node).end].trim();
    is_explicit_whitespace_string_expression(text)
}

fn sort_and_dedup_normalization_edits(edits: &mut Vec<NormalizationEdit>) {
    edits.sort_by_key(normalization_edit_sort_key);
    edits.dedup();
}

fn normalization_edit_sort_key(edit: &NormalizationEdit) -> (usize, usize, u8, String) {
    match edit {
        NormalizationEdit::Delete { span } => (span.start, span.end, 0, String::new()),
        NormalizationEdit::Insert { at, text } => (*at, *at, 1, text.clone()),
    }
}

fn declared_names_from_const_tag(
    source: &str,
    node: Node<'_>,
) -> Result<Vec<String>, SvelteFrameworkError> {
    declared_names_from_optional_raw_text(source, node, BindingParseMode::VariableDeclarator)
        .map(|names| names.unwrap_or_default())
}

fn declared_names_from_each_start(
    source: &str,
    node: Node<'_>,
) -> Result<Vec<String>, SvelteFrameworkError> {
    let Some(parameter) = node.child_by_field_name("parameter") else {
        return Ok(Vec::new());
    };
    Ok(collect_declared_names_from_binding_source(
        text(source, parameter),
        BindingParseMode::FunctionParams,
        JsLikeLanguage::TypeScript,
    )?)
}

fn declared_names_from_optional_raw_text(
    source: &str,
    node: Node<'_>,
    mode: BindingParseMode,
) -> Result<Option<Vec<String>>, SvelteFrameworkError> {
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
    conventions: &FrameworkConventions,
) -> Result<Vec<MacroImport>, SvelteFrameworkError> {
    let js_tree = match language {
        JsLikeLanguage::JavaScript => parse_javascript(source)?,
        JsLikeLanguage::TypeScript => parse_typescript(source)?,
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
        if !is_macro_module_specifier(&module_specifier, conventions) {
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

fn collect_script_macro_import_statement_spans(
    source: &str,
    base_offset: usize,
    language: JsLikeLanguage,
    conventions: &FrameworkConventions,
) -> Result<Vec<Span>, SvelteFrameworkError> {
    let js_tree = match language {
        JsLikeLanguage::JavaScript => parse_javascript(source)?,
        JsLikeLanguage::TypeScript => parse_typescript(source)?,
    };
    let root = js_tree.root_node();
    let mut spans = Vec::new();
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
        if !is_macro_module_specifier(&module_specifier, conventions) {
            continue;
        }

        spans.push(shift_span(Span::from_node(child), base_offset));
    }

    Ok(spans)
}

fn expand_import_removal_span_in_source(source: &str, span: Span) -> Span {
    let mut start = span.start;
    let mut end = span.end;
    let bytes = source.as_bytes();

    while start > 0 && bytes[start - 1] != b'\n' {
        start -= 1;
    }

    if bytes.get(end) == Some(&b'\r') && bytes.get(end + 1) == Some(&b'\n') {
        end += 2;
    } else if bytes.get(end) == Some(&b'\n') {
        end += 1;
    }

    if bytes.get(end) == Some(&b'\r') && bytes.get(end + 1) == Some(&b'\n') {
        end += 2;
    } else if bytes.get(end) == Some(&b'\n') {
        end += 1;
    }

    Span::new(start, end)
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

fn is_macro_module_specifier(specifier: &str, conventions: &FrameworkConventions) -> bool {
    conventions.accepts_macro_package(specifier)
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

fn repair_svelte_expression_inner_span(source: &str, node: Node<'_>, raw_span: Span) -> Span {
    if node.kind() != "expression" {
        return repair_svelte_raw_expression_span(source, raw_span);
    }

    repair_svelte_raw_expression_span(source, raw_span)
}

fn repair_svelte_raw_expression_span(source: &str, raw_span: Span) -> Span {
    let mut start = raw_span.start;
    if start >= 2
        && source.as_bytes()[start - 2] == b'$'
        && is_js_identifier_byte(source.as_bytes()[start - 1])
    {
        start -= 2;
    } else if start >= 1 && source.as_bytes()[start - 1] == b'$' {
        start -= 1;
    }

    Span::new(start, raw_span.end)
}

fn is_js_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

fn repair_svelte_candidates(source: &str, candidates: &mut [MacroCandidate]) {
    for candidate in candidates {
        repair_svelte_candidate(source, candidate);
    }
}

fn repair_svelte_candidate(source: &str, candidate: &mut MacroCandidate) {
    match candidate.flavor {
        MacroFlavor::Reactive => {
            let pattern = format!("${}", candidate.local_name);
            let Some(start) = find_svelte_prefix_near(
                source,
                candidate.outer_span.start,
                candidate.outer_span.end,
                &pattern,
            ) else {
                return;
            };
            if start >= candidate.outer_span.start {
                return;
            }

            candidate.outer_span = Span::new(start, candidate.outer_span.end);
            candidate.normalized_span = candidate.outer_span;
            candidate.normalization_edits = vec![NormalizationEdit::Delete {
                span: Span::new(start, start + 1),
            }];
            candidate.source_map_anchor = Some(Span::new(start + 1, start + pattern.len()));
        }
        MacroFlavor::Eager => {
            let pattern = format!("{}.eager", candidate.local_name);
            let Some(start) = find_svelte_prefix_near(
                source,
                candidate.outer_span.start,
                candidate.outer_span.end,
                &pattern,
            ) else {
                return;
            };
            if start >= candidate.outer_span.start {
                return;
            }

            let object_end = start + candidate.local_name.len();
            let property_end = start + pattern.len();
            candidate.outer_span = Span::new(start, candidate.outer_span.end);
            candidate.normalized_span = Span::new(
                object_end - candidate.local_name.len(),
                candidate.normalized_span.end,
            );
            candidate.normalization_edits = vec![NormalizationEdit::Delete {
                span: Span::new(object_end, property_end),
            }];
            candidate.source_map_anchor = Some(Span::new(start, object_end));
        }
        MacroFlavor::Direct => {}
    }
}

fn find_svelte_prefix_near(
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

fn bare_direct_macro_error(imported_name: &str) -> SvelteFrameworkError {
    match imported_name {
        "t" => SvelteFrameworkError::BareDirectTNotAllowed,
        "plural" => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Borrowed("plural"),
        },
        "select" => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Borrowed("select"),
        },
        "selectOrdinal" => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Borrowed("selectOrdinal"),
        },
        other => SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager {
            imported_name: Cow::Owned(other.to_string()),
        },
    }
}

pub fn validate_svelte_extract_candidates(
    candidates: &[MacroCandidate],
) -> Result<(), SvelteFrameworkError> {
    let offending_macro = candidates
        .iter()
        .find(|candidate| {
            candidate.strategy == MacroCandidateStrategy::Standalone
                && candidate.flavor == MacroFlavor::Direct
                && matches!(
                    candidate.imported_name.as_str(),
                    "t" | "plural" | "select" | "selectOrdinal"
                )
        })
        .map(|candidate| candidate.imported_name.as_str());

    if let Some(imported_name) = offending_macro {
        return Err(bare_direct_macro_error(imported_name));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::find_svelte_prefix_near;

    #[test]
    fn finds_svelte_prefix_near_unicode_without_splitting_multibyte_text() {
        let source = "<p>前置き🎌 {$t`家族👨‍👩‍👧‍👦😀😃😄 ${name}`} 後置き🍣</p>";
        let current_start = source.find("t`").expect("template starts at t");
        let current_end = source
            .find("}`")
            .map(|index| index + 2)
            .unwrap_or(source.len());

        let start = find_svelte_prefix_near(source, current_start, current_end, "$t")
            .expect("finds reactive prefix");

        assert_eq!(&source[start..start + 2], "$t");
        assert!(source.is_char_boundary(start));
    }
}
