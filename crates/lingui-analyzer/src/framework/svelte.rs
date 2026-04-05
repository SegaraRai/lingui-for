use std::borrow::Cow;

use tree_sitter::Node;

use crate::common::{
    EmbeddedScriptKind, EmbeddedScriptRegion, ScriptLang, Span, format_invalid_macro_usage,
    format_unsupported_trans_child_syntax,
};
use crate::conventions::{FrameworkConventions, MacroConventionsError, MacroPackageKind};

use super::helpers::anchors::{collect_node_start_anchors, extend_shifted_node_start_anchors};
use super::helpers::components::first_non_whitespace_child_anchor;
use super::helpers::expressions::is_explicit_whitespace_string_expression;
use super::helpers::imports::collect_import_specifiers_from_node;
use super::helpers::normalization::{
    sort_and_dedup_normalization_edits, whitespace_replacement_edits,
};
use super::helpers::text::{find_pattern_near_start, is_component_tag_name, text, unquote};
use super::js::{
    BindingParseMode, ExpressionParseCache, JsAnalysisError, JsMacroSyntax,
    collect_declared_names_from_binding_source, collect_macro_candidates,
    collect_top_level_declared_names_from_root,
};
use super::parse::{ParseError, parse_svelte};
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
    #[error(transparent)]
    Conventions(#[from] MacroConventionsError),
    #[error("{0}")]
    InvalidMacroUsage(String),
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
    #[error(
        "Module scripts in `.svelte` files must import Lingui macros from `@lingui/core/macro`, not `lingui-for-svelte/macro`."
    )]
    ModuleScriptMustUseCoreMacroPackage,
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
        expression_parse_cache: ExpressionParseCache::default(),
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
    let script_tree = language.parse(script_source)?;
    extend_shifted_node_start_anchors(
        script_source,
        script_tree.root_node(),
        content_region.inner_span.start,
        source_anchors,
    );
    let script_root = script_tree.root_node();
    let declared_names = collect_top_level_declared_names_from_root(script_source, script_root);
    let macro_imports = collect_script_macro_imports(
        script_source,
        script_root,
        content_region.inner_span.start,
        &options.conventions,
    )?;
    let is_module = start_tag_is_module(source, start_tag);
    validate_module_script_macro_imports(
        source,
        &macro_imports,
        is_module,
        &options.conventions,
        &options.source_name,
    )?;
    let macro_import_statement_spans = collect_script_macro_import_statement_spans(
        script_source,
        script_root,
        content_region.inner_span.start,
        &options.conventions,
    )?
    .into_iter()
    .map(|span| expand_import_removal_span_in_source(source, span))
    .collect();
    let candidates = collect_macro_candidates(
        script_source,
        script_root,
        &macro_imports,
        content_region.inner_span.start,
        if is_module {
            JsMacroSyntax::Standard
        } else {
            JsMacroSyntax::Svelte
        },
        &[],
    );

    Ok(Some(SvelteScriptBlock {
        region: content_region,
        is_module,
        is_typescript: matches!(language, ScriptLang::Ts),
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
    expression_parse_cache: ExpressionParseCache,
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
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;

    let candidates = collect_macro_candidates(
        text(source, identifier),
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        &shadowed_names,
    );
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
        component_candidate_from_element(source, node, imports, options, context)?
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
        ScriptLang::Ts,
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
    let names =
        collect_declared_names_from_binding_source(text(source, raw_text), mode, ScriptLang::Ts)?;
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

fn collect_script_macro_imports(
    source: &str,
    root: Node<'_>,
    base_offset: usize,
    conventions: &FrameworkConventions,
) -> Result<Vec<MacroImport>, SvelteFrameworkError> {
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
    root: Node<'_>,
    base_offset: usize,
    conventions: &FrameworkConventions,
) -> Result<Vec<Span>, SvelteFrameworkError> {
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

        spans.push(Span::from_node(child).shifted(base_offset));
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

fn start_tag_is_module(source: &str, start_tag: Node<'_>) -> bool {
    let mut cursor = start_tag.walk();
    for child in start_tag.children(&mut cursor) {
        if child.kind() != "attribute" {
            continue;
        }

        let attribute_text = text(source, child).trim();
        if attribute_text == "module" {
            return true;
        }

        let Some((name, raw_value)) = attribute_text.split_once('=') else {
            continue;
        };

        if name.trim() != "context" {
            continue;
        }

        let value = raw_value.trim().trim_matches('"').trim_matches('\'');
        if value == "module" {
            return true;
        }
    }

    false
}

fn validate_module_script_macro_imports(
    source: &str,
    macro_imports: &[MacroImport],
    is_module: bool,
    conventions: &FrameworkConventions,
    source_name: &str,
) -> Result<(), SvelteFrameworkError> {
    if !is_module {
        return Ok(());
    }

    let svelte_packages = conventions
        .macro_
        .required_package(MacroPackageKind::Svelte)?;

    let Some(offending_import) = macro_imports
        .iter()
        .find(|import_decl| svelte_packages.contains(&import_decl.source))
    else {
        return Ok(());
    };

    Err(SvelteFrameworkError::InvalidMacroUsage(
        format_invalid_macro_usage(
            source,
            source_name,
            offending_import.span,
            "Module scripts in `.svelte` files must import Lingui macros from `@lingui/core/macro`, not `lingui-for-svelte/macro`.",
        ),
    ))
}

fn script_language(source: &str, start_tag: Node<'_>) -> ScriptLang {
    let mut cursor = start_tag.walk();
    for child in start_tag.children(&mut cursor) {
        if child.kind() != "attribute" {
            continue;
        }

        let attribute_text = text(source, child);
        if attribute_text.contains("lang") && attribute_text.contains("ts") {
            return ScriptLang::Ts;
        }
    }

    ScriptLang::Js
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
            let Some(start) = find_pattern_near_start(
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
            let Some(start) = find_pattern_near_start(
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

pub(crate) fn bare_direct_macro_message(imported_name: &str) -> String {
    match bare_direct_macro_error(imported_name) {
        SvelteFrameworkError::BareDirectTNotAllowed => {
            "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string()
        }
        SvelteFrameworkError::BareDirectMacroRequiresReactiveOrEager { imported_name } => format!(
            "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
        ),
        _ => unreachable!("unexpected bare direct macro error variant"),
    }
}

pub fn validate_svelte_extract_candidates(
    source_name: &str,
    source: &str,
    candidates: &[MacroCandidate],
) -> Result<(), SvelteFrameworkError> {
    let offending_candidate = candidates.iter().find(|candidate| {
        candidate.strategy == MacroCandidateStrategy::Standalone
            && candidate.flavor == MacroFlavor::Direct
            && matches!(
                candidate.imported_name.as_str(),
                "t" | "plural" | "select" | "selectOrdinal"
            )
    });

    if let Some(candidate) = offending_candidate {
        return Err(SvelteFrameworkError::InvalidMacroUsage(
            format_invalid_macro_usage(
                source,
                source_name,
                candidate.outer_span,
                bare_direct_macro_message(candidate.imported_name.as_str()),
            ),
        ));
    }

    Ok(())
}

fn validate_runtime_lowerable_svelte_component(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), SvelteFrameworkError> {
    fn validate_node(
        source: &str,
        node: Node<'_>,
        options: &AnalyzeOptions,
    ) -> Result<(), SvelteFrameworkError> {
        match node.kind() {
            "if_statement" | "each_statement" | "await_statement" | "key_statement"
            | "snippet_statement" | "const_tag" => {
                return Err(SvelteFrameworkError::InvalidMacroUsage(
                    format_unsupported_trans_child_syntax(
                        source,
                        &options.source_name,
                        Span::from_node(node),
                        "Svelte block syntax",
                    ),
                ));
            }
            "element" | "self_closing_tag" => {
                validate_svelte_element_like(source, node, options)?;
            }
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            validate_node(source, child, options)?;
        }

        Ok(())
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        validate_node(source, child, options)?;
    }

    Ok(())
}

fn validate_svelte_element_like(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), SvelteFrameworkError> {
    let tag = match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag"),
        "self_closing_tag" => Some(node),
        _ => None,
    };
    let Some(tag) = tag else {
        return Ok(());
    };

    if let Some(tag_name_node) = tag
        .children(&mut tag.walk())
        .find(|child| child.kind() == "tag_name")
    {
        let tag_name = text(source, tag_name_node);
        if tag_name == "slot" || tag_name.starts_with("svelte:") {
            return Err(SvelteFrameworkError::InvalidMacroUsage(
                format_unsupported_trans_child_syntax(
                    source,
                    &options.source_name,
                    Span::from_node(tag_name_node),
                    format!("Svelte special element `<{tag_name}>`"),
                ),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::framework::helpers::text::find_pattern_near_start;

    #[test]
    fn finds_svelte_prefix_near_unicode_without_splitting_multibyte_text() {
        let source = "<p>前置き🎌 {$t`家族👨‍👩‍👧‍👦😀😃😄 ${name}`} 後置き🍣</p>";
        let current_start = source.find("t`").expect("template starts at t");
        let current_end = source
            .find("}`")
            .map(|index| index + 2)
            .unwrap_or(source.len());

        let start = find_pattern_near_start(source, current_start, current_end, "$t")
            .expect("finds reactive prefix");

        assert_eq!(&source[start..start + 2], "$t");
        assert!(source.is_char_boundary(start));
    }
}
