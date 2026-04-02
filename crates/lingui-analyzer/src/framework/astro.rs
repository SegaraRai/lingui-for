use tree_sitter::Node;

use crate::common::{EmbeddedScriptKind, EmbeddedScriptRegion, Span};
use crate::conventions::FrameworkConventions;

use super::anchors::{collect_node_start_anchors, extend_shifted_node_start_anchors};
use super::expression::is_explicit_whitespace_string_expression;
use super::js::{
    ExpressionParseCache, JsAnalysisError, JsLikeLanguage, JsMacroSyntax, collect_macro_candidates,
};
use super::parse::{ParseError, parse_astro, parse_typescript};
use super::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, MacroCandidate, MacroCandidateKind,
    MacroCandidateStrategy, MacroFlavor, MacroImport, NormalizationEdit, WhitespaceMode,
};

#[derive(thiserror::Error, Debug)]
pub enum AstroFrameworkError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroTemplateExpression {
    pub outer_span: Span,
    pub inner_span: Span,
    pub candidates: Vec<MacroCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroTemplateComponent {
    pub candidate: MacroCandidate,
    pub shadowed_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroFrontmatterAnalysis {
    pub frontmatter: Option<EmbeddedScriptRegion>,
    pub macro_imports: Vec<MacroImport>,
    pub frontmatter_candidates: Vec<MacroCandidate>,
    pub template_expressions: Vec<AstroTemplateExpression>,
    pub template_components: Vec<AstroTemplateComponent>,
    pub source_anchors: Vec<usize>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct AstroAdapter;

#[derive(Debug, Default)]
struct AstroCollectContext {
    expression_parse_cache: ExpressionParseCache,
}

impl FrameworkAdapter for AstroAdapter {
    type Analysis = AstroFrontmatterAnalysis;

    fn analyze(
        &self,
        source: &str,
        options: &AnalyzeOptions,
    ) -> Result<Self::Analysis, FrameworkError> {
        Ok(analyze_astro(source, options)?)
    }
}

fn analyze_astro(
    source: &str,
    options: &AnalyzeOptions,
) -> Result<AstroFrontmatterAnalysis, AstroFrameworkError> {
    let astro_tree = parse_astro(source)?;
    let root = astro_tree.root_node();
    let mut source_anchors = collect_node_start_anchors(source, root);
    let frontmatter = find_frontmatter(root);

    let (macro_imports, frontmatter_candidates) = if let Some(frontmatter_region) = &frontmatter {
        let frontmatter_source =
            &source[frontmatter_region.inner_span.start..frontmatter_region.inner_span.end];
        let frontmatter_tree = parse_typescript(frontmatter_source)?;
        extend_shifted_node_start_anchors(
            frontmatter_source,
            frontmatter_tree.root_node(),
            frontmatter_region.inner_span.start,
            &mut source_anchors,
        );
        let frontmatter_root = frontmatter_tree.root_node();
        let macro_imports = collect_macro_imports(
            frontmatter_source,
            frontmatter_root,
            frontmatter_region.inner_span.start,
            &options.conventions,
        );
        let candidates = collect_macro_candidates(
            frontmatter_source,
            frontmatter_root,
            &macro_imports,
            frontmatter_region.inner_span.start,
            JsMacroSyntax::Standard,
            &[],
        );
        (macro_imports, candidates)
    } else {
        (Vec::new(), Vec::new())
    };

    let (template_expressions, template_components) =
        collect_template_expressions(source, root, &macro_imports, options)?;

    Ok(AstroFrontmatterAnalysis {
        frontmatter,
        macro_imports,
        frontmatter_candidates,
        template_expressions,
        template_components,
        source_anchors,
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

fn collect_macro_imports(
    source: &str,
    root: Node<'_>,
    base_offset: usize,
    conventions: &FrameworkConventions,
) -> Vec<MacroImport> {
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

    imports
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

fn collect_template_expressions(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
) -> Result<(Vec<AstroTemplateExpression>, Vec<AstroTemplateComponent>), AstroFrameworkError> {
    let mut context = AstroCollectContext::default();
    fn collect_template_expressions_impl(
        source: &str,
        node: Node<'_>,
        imports: &[MacroImport],
        options: &AnalyzeOptions,
        context: &mut AstroCollectContext,
        expressions: &mut Vec<AstroTemplateExpression>,
        components: &mut Vec<AstroTemplateComponent>,
    ) -> Result<(), AstroFrameworkError> {
        match node.kind() {
            "html_interpolation" => {
                // Only treat pure JS/TS interpolations as standalone expression containers here.
                // Mixed markup cases recurse into child nodes so nested containers are handled once.
                if is_pure_html_interpolation_expression(node) {
                    push_template_expression(
                        source,
                        Span::from_node(node),
                        inner_range_from_delimiters(node, 1, 1),
                        imports,
                        context,
                        expressions,
                    )?;
                    return Ok(());
                }
            }
            "element" => {
                if let Some(component) =
                    component_candidate_from_element(source, node, imports, options, context)
                {
                    components.push(component);
                    return Ok(());
                }
            }
            "attribute_interpolation" => {
                let inner = node
                    .children(&mut node.walk())
                    .find(|child| child.kind() == "attribute_js_expr")
                    .map(Span::from_node)
                    .unwrap_or_else(|| inner_range_from_delimiters(node, 1, 1));
                push_template_expression(
                    source,
                    Span::from_node(node),
                    inner,
                    imports,
                    context,
                    expressions,
                )?;
                return Ok(());
            }
            "attribute_backtick_string" => {
                push_template_expression(
                    source,
                    Span::from_node(node),
                    inner_range_from_delimiters(node, 1, 1),
                    imports,
                    context,
                    expressions,
                )?;
                return Ok(());
            }
            "frontmatter_js_block" => return Ok(()),
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            collect_template_expressions_impl(
                source,
                child,
                imports,
                options,
                context,
                expressions,
                components,
            )?;
        }

        Ok(())
    }

    let mut expressions = Vec::new();
    let mut components = Vec::new();
    collect_template_expressions_impl(
        source,
        node,
        imports,
        options,
        &mut context,
        &mut expressions,
        &mut components,
    )?;
    Ok((expressions, components))
}

fn push_template_expression(
    source: &str,
    outer_span: Span,
    inner_span: Span,
    imports: &[MacroImport],
    context: &mut AstroCollectContext,
    expressions: &mut Vec<AstroTemplateExpression>,
) -> Result<(), AstroFrameworkError> {
    let expression_source = &source[inner_span.start..inner_span.end];
    let tree =
        context
            .expression_parse_cache
            .parse(source, inner_span, JsLikeLanguage::TypeScript)?;

    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Standard,
        &[],
    );
    expressions.push(AstroTemplateExpression {
        outer_span,
        inner_span,
        candidates,
    });
    Ok(())
}

fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
) -> Option<AstroTemplateComponent> {
    let mut cursor = node.walk();
    let tag_node = node
        .children(&mut cursor)
        .find(|child| child.kind() == "start_tag" || child.kind() == "self_closing_tag")?;
    let tag_name_node = tag_node
        .children(&mut tag_node.walk())
        .find(|child| child.kind() == "tag_name")?;
    let tag_name = text(source, tag_name_node);
    if !is_component_tag_name(tag_name) {
        return None;
    }

    let import_decl = imports
        .iter()
        .find(|import_decl| import_decl.local_name == tag_name)?;
    let normalization_edits =
        collect_component_normalization_edits(source, node, imports, options, context);

    Some(AstroTemplateComponent {
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
        shadowed_names: Vec::new(),
    })
}

fn component_source_map_anchor(source: &str, node: Node<'_>) -> Option<Span> {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "start_tag"
            || child.kind() == "self_closing_tag"
            || child.kind() == "end_tag"
        {
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

fn inner_range_from_delimiters(node: Node<'_>, prefix_len: usize, suffix_len: usize) -> Span {
    let start = node.start_byte().saturating_add(prefix_len);
    let end = node.end_byte().saturating_sub(suffix_len).max(start);
    Span { start, end }
}

fn is_pure_html_interpolation_expression(node: Node<'_>) -> bool {
    let mut cursor = node.walk();
    let mut saw_named_child = false;
    for child in node.named_children(&mut cursor) {
        saw_named_child = true;
        if child.kind() != "permissible_text" {
            return false;
        }
    }

    saw_named_child
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

fn is_component_tag_name(tag_name: &str) -> bool {
    tag_name
        .chars()
        .next()
        .map(|first| first.is_ascii_uppercase())
        .unwrap_or(false)
}

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
) -> Vec<NormalizationEdit> {
    let mut edits =
        collect_nested_component_normalization_edits(source, node, imports, options, context);
    edits.extend(component_whitespace_edits(source, node, options));
    sort_and_dedup_normalization_edits(&mut edits);
    edits
}

fn collect_nested_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
) -> Vec<NormalizationEdit> {
    let mut edits = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "frontmatter_js_block" => {}
            "html_interpolation" => {
                let inner = inner_range_from_delimiters(child, 1, 1);
                if let Ok(tree) =
                    context
                        .expression_parse_cache
                        .parse(source, inner, JsLikeLanguage::TypeScript)
                {
                    let candidates = collect_macro_candidates(
                        &source[inner.start..inner.end],
                        tree.root_node(),
                        imports,
                        inner.start,
                        JsMacroSyntax::Standard,
                        &[],
                    );
                    for candidate in candidates {
                        edits.extend(candidate.normalization_edits);
                    }
                }
            }
            "attribute_interpolation" => {
                let inner = child
                    .children(&mut child.walk())
                    .find(|grandchild| grandchild.kind() == "attribute_js_expr")
                    .map(Span::from_node)
                    .unwrap_or_else(|| inner_range_from_delimiters(child, 1, 1));
                if let Ok(tree) =
                    context
                        .expression_parse_cache
                        .parse(source, inner, JsLikeLanguage::TypeScript)
                {
                    let candidates = collect_macro_candidates(
                        &source[inner.start..inner.end],
                        tree.root_node(),
                        imports,
                        inner.start,
                        JsMacroSyntax::Standard,
                        &[],
                    );
                    for candidate in candidates {
                        edits.extend(candidate.normalization_edits);
                    }
                }
            }
            "attribute_backtick_string" => {
                let inner = inner_range_from_delimiters(child, 1, 1);
                if let Ok(tree) =
                    context
                        .expression_parse_cache
                        .parse(source, inner, JsLikeLanguage::TypeScript)
                {
                    let candidates = collect_macro_candidates(
                        &source[inner.start..inner.end],
                        tree.root_node(),
                        imports,
                        inner.start,
                        JsMacroSyntax::Standard,
                        &[],
                    );
                    for candidate in candidates {
                        edits.extend(candidate.normalization_edits);
                    }
                }
            }
            "element" => {
                if let Some(component) =
                    component_candidate_from_element(source, child, imports, options, context)
                {
                    edits.extend(component.candidate.normalization_edits);
                    continue;
                }
                edits.extend(collect_nested_component_normalization_edits(
                    source, child, imports, options, context,
                ));
            }
            _ => {
                edits.extend(collect_nested_component_normalization_edits(
                    source, child, imports, options, context,
                ));
            }
        }
    }

    edits
}

fn component_whitespace_edits(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Vec<NormalizationEdit> {
    if options.whitespace == WhitespaceMode::Jsx {
        return Vec::new();
    }

    let mut content_children = Vec::new();
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if matches!(child.kind(), "start_tag" | "self_closing_tag" | "end_tag") {
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
    let span = Span::from_node(node);
    let text = source[span.start..span.end].trim();
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
