use tree_sitter::Node;

use crate::common::{
    EmbeddedScriptKind, EmbeddedScriptRegion, ScriptLang, Span, format_invalid_macro_usage,
};
use crate::conventions::{FrameworkConventions, MacroPackageKind};

use super::super::shared::helpers::anchors::{
    collect_node_start_anchors, extend_shifted_node_start_anchors,
};
use super::super::shared::helpers::imports::collect_import_specifiers_from_node;
use super::super::shared::helpers::text::{find_pattern_near_start, text, unquote};
use super::super::shared::js::{
    BindingParseMode, ExpressionParseCache, JsMacroSyntax,
    collect_declared_names_from_binding_source, collect_macro_candidates,
    collect_top_level_declared_names_from_root,
};
use super::super::shared::parse::parse_svelte;
use super::super::{AnalyzeOptions, MacroCandidate, MacroFlavor, MacroImport, NormalizationEdit};
use super::components::{component_candidate_from_element, let_bindings_from_element};
use super::{
    SvelteFrameworkError, SvelteScriptAnalysis, SvelteScriptBlock, SvelteTemplateComponent,
    SvelteTemplateExpression,
};

pub fn analyze_svelte(
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

#[derive(Debug, Default)]
pub(super) struct CollectContext {
    pub(super) scope_stack: Vec<Vec<String>>,
    pub(super) expressions: Vec<SvelteTemplateExpression>,
    pub(super) components: Vec<SvelteTemplateComponent>,
    pub(super) expression_parse_cache: ExpressionParseCache,
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
        text(source, parameter),
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
    let names =
        collect_declared_names_from_binding_source(text(source, raw_text), mode, ScriptLang::Ts)?;
    Ok(Some(names))
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

        let mut attribute_cursor = child.walk();
        let Some(name_node) = child
            .children(&mut attribute_cursor)
            .find(|grandchild| grandchild.kind() == "attribute_name")
        else {
            continue;
        };

        if text(source, name_node) != "lang" {
            continue;
        }

        let mut value_cursor = child.walk();
        let value = child
            .named_children(&mut value_cursor)
            .find(|grandchild| grandchild.kind() != "attribute_name")
            .map(|value_node| {
                let raw_value = text(source, value_node);
                unquote(raw_value)
                    .unwrap_or_else(|| raw_value.to_string())
                    .trim()
                    .to_ascii_lowercase()
            });
        if matches!(value.as_deref(), Some("ts" | "typescript")) {
            return ScriptLang::Ts;
        }
    }

    ScriptLang::Js
}

fn is_macro_module_specifier(specifier: &str, conventions: &FrameworkConventions) -> bool {
    conventions.accepts_macro_package(specifier)
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

pub(super) fn repair_svelte_expression_inner_span(
    source: &str,
    node: Node<'_>,
    raw_span: Span,
) -> Span {
    if node.kind() != "expression" {
        return repair_svelte_raw_expression_span(source, raw_span);
    }

    repair_svelte_raw_expression_span(source, raw_span)
}

pub(super) fn repair_svelte_raw_expression_span(source: &str, raw_span: Span) -> Span {
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

#[cfg(test)]
mod tests {
    use super::script_language;
    use crate::common::ScriptLang;
    use crate::framework::shared::parse::parse_svelte;

    #[test]
    fn script_language_only_treats_explicit_lang_ts_as_typescript() {
        let source = r#"<script data-lang="ts" lang="ts">let answer = 42;</script>"#;
        let tree = parse_svelte(source).expect("parse succeeds");
        let root = tree.root_node();
        let script_element = root
            .children(&mut root.walk())
            .find(|child| child.kind() == "script_element")
            .expect("script element exists");
        let start_tag = script_element
            .children(&mut script_element.walk())
            .find(|child| child.kind() == "start_tag")
            .expect("start tag exists");

        assert_eq!(script_language(source, start_tag), ScriptLang::Ts);
    }

    #[test]
    fn script_language_ignores_non_lang_attributes_that_happen_to_contain_ts() {
        let source = r#"<script data-lang="ts" context="module">let answer = 42;</script>"#;
        let tree = parse_svelte(source).expect("parse succeeds");
        let root = tree.root_node();
        let script_element = root
            .children(&mut root.walk())
            .find(|child| child.kind() == "script_element")
            .expect("script element exists");
        let start_tag = script_element
            .children(&mut script_element.walk())
            .find(|child| child.kind() == "start_tag")
            .expect("start tag exists");

        assert_eq!(script_language(source, start_tag), ScriptLang::Js);
    }
}
