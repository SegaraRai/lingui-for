use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{EmbeddedScriptKind, EmbeddedScriptRegion, ScriptLang, Span, text, unquote};
use crate::conventions::{FrameworkConventions, MacroPackageKind};
use crate::diagnostics::svelte::module_script_must_use_core_macro_package;
use crate::syntax::parse::parse_svelte;

use super::super::shared::helpers::anchors::{
    collect_node_start_anchors, extend_shifted_node_start_anchors,
};
use super::super::shared::helpers::imports::collect_import_specifiers_from_node;
use super::super::shared::js::{
    JsMacroSyntax, collect_macro_candidates, collect_top_level_declared_names_from_root,
};
use super::super::{AnalyzeOptions, MacroImport};
use super::components::component_candidate_from_element;
use super::walk::{
    SvelteTemplateVisitor, TemplateWalkContext, find_first_descendant, walk_svelte_template,
};
use super::{
    SvelteFrameworkError, SvelteScriptAnalysis, SvelteScriptBlock, SvelteSemanticAnalysis,
    SvelteSourceMetadata, SvelteTemplateComponent, SvelteTemplateExpression,
};

pub fn analyze_svelte(
    source: &str,
    options: &AnalyzeOptions,
) -> Result<SvelteScriptAnalysis, SvelteFrameworkError> {
    let tree = parse_svelte(source)?;
    let root = tree.root_node();
    let mut source_anchors = collect_node_start_anchors(source, root);
    let scripts = collect_script_blocks(source, root, options, &mut source_anchors)?;
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
    template_shadowed_names.sort_unstable();
    template_shadowed_names.dedup();
    let mut context = CollectContext {
        scope_stack: vec![template_shadowed_names],
        expression_parse_cache: Default::default(),
    };
    let mut visitor = AnalysisVisitor::new(&template_imports, options);
    walk_svelte_template(source, root, options, &mut context, &mut visitor)?;
    let (expressions, components) = visitor.finish();
    Ok(SvelteScriptAnalysis {
        semantic: SvelteSemanticAnalysis {
            scripts,
            template_expressions: expressions,
            template_components: components,
        },
        metadata: SvelteSourceMetadata { source_anchors },
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
        std::iter::empty::<&str>(),
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

pub(super) type CollectContext = TemplateWalkContext;

struct AnalysisVisitor<'a> {
    imports: &'a [MacroImport],
    options: &'a AnalyzeOptions,
    expressions: Vec<SvelteTemplateExpression>,
    components: Vec<SvelteTemplateComponent>,
}

impl<'a> AnalysisVisitor<'a> {
    fn new(imports: &'a [MacroImport], options: &'a AnalyzeOptions) -> Self {
        Self {
            imports,
            options,
            expressions: Vec::new(),
            components: Vec::new(),
        }
    }
}

impl SvelteTemplateVisitor for AnalysisVisitor<'_> {
    type Output = (Vec<SvelteTemplateExpression>, Vec<SvelteTemplateComponent>);

    fn visit_expression(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError> {
        push_expression(source, node, self.imports, context, &mut self.expressions)
    }

    fn visit_raw_text_expression(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError> {
        push_raw_text_expression(source, node, self.imports, context, &mut self.expressions)
    }

    fn visit_each_start(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError> {
        push_each_start_expression(source, node, self.imports, context, &mut self.expressions)
    }

    fn visit_element_like(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<bool, SvelteFrameworkError> {
        if let Some(candidate) =
            component_candidate_from_element(source, node, self.imports, self.options, context)?
        {
            self.components.push(candidate);
            return Ok(true);
        }
        Ok(false)
    }

    fn finish(self) -> Self::Output {
        (self.expressions, self.components)
    }
}

fn push_expression(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    context: &mut TemplateWalkContext,
    expressions: &mut Vec<SvelteTemplateExpression>,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "svelte_raw_text")
    else {
        return Ok(());
    };
    let inner_span = Span::from_node(raw_text);
    let outer_span = Span::from_node(node);
    let expression_source = &source[inner_span.start..inner_span.end];
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;
    let shadowed_names = context.shadowed_names().cloned().collect::<Vec<_>>();
    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        shadowed_names.iter(),
    );
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
    context: &mut TemplateWalkContext,
    expressions: &mut Vec<SvelteTemplateExpression>,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = find_first_descendant(node, "svelte_raw_text") else {
        return Ok(());
    };

    let inner_span = Span::from_node(raw_text);
    let expression_source = &source[inner_span.start..inner_span.end];
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;
    let shadowed_names = context.shadowed_names().cloned().collect::<Vec<_>>();
    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        shadowed_names.iter(),
    );
    expressions.push(SvelteTemplateExpression {
        outer_span: Span::from_node(node),
        inner_span,
        candidates,
        shadowed_names,
    });
    Ok(())
}

fn push_each_start_expression(
    source: &str,
    each_start: Node<'_>,
    imports: &[MacroImport],
    context: &mut TemplateWalkContext,
    expressions: &mut Vec<SvelteTemplateExpression>,
) -> Result<(), SvelteFrameworkError> {
    let Some(identifier) = each_start.child_by_field_name("identifier") else {
        return Ok(());
    };

    let inner_span = Span::from_node(identifier);
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;
    let shadowed_names = context.shadowed_names().cloned().collect::<Vec<_>>();

    let candidates = collect_macro_candidates(
        text(source, identifier),
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        shadowed_names.iter(),
    );
    expressions.push(SvelteTemplateExpression {
        outer_span: Span::from_node(each_start),
        inner_span,
        candidates,
        shadowed_names,
    });
    Ok(())
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
        if !conventions.accepts_macro_package(module_specifier) {
            continue;
        }

        collect_import_specifiers_from_node(
            source,
            child,
            base_offset,
            &LeanString::from(module_specifier),
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
        if !conventions.accepts_macro_package(module_specifier) {
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

    // Intentionally consume one more trailing line break after the import so
    // `expand_import_removal_span_in_source` removes the extra blank line as
    // well. Advance by 2 for CRLF and by 1 for LF to avoid off-by-one errors.
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
        module_script_must_use_core_macro_package(source, source_name, offending_import.span),
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
                    .unwrap_or(raw_value)
                    .trim()
                    .to_ascii_lowercase()
            });
        if matches!(value.as_deref(), Some("ts" | "typescript")) {
            return ScriptLang::Ts;
        }
    }

    ScriptLang::Js
}

#[cfg(test)]
mod tests {
    use super::script_language;
    use crate::common::ScriptLang;
    use crate::syntax::parse::parse_svelte;

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
