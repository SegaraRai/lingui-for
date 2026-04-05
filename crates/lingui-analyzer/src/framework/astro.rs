use tree_sitter::Node;

use crate::common::{
    EmbeddedScriptKind, EmbeddedScriptRegion, ScriptLang, Span,
    format_unsupported_trans_child_syntax,
};
use crate::conventions::FrameworkConventions;

use super::astro_ir::{
    BundledAstroHtmlInterpolation, bundle_html_interpolations, lower_html_interpolation_node,
};
use super::helpers::anchors::{collect_node_start_anchors, extend_shifted_node_start_anchors};
use super::helpers::components::first_non_whitespace_child_anchor;
use super::helpers::expressions::is_explicit_whitespace_string_expression;
use super::helpers::imports::collect_import_specifiers_from_node;
use super::helpers::normalization::{
    sort_and_dedup_normalization_edits, whitespace_replacement_edits,
};
use super::helpers::text::{is_component_tag_name, text, unquote};
use super::js::{ExpressionParseCache, JsAnalysisError, JsMacroSyntax, collect_macro_candidates};
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
    #[error(transparent)]
    Ir(#[from] super::astro_ir::AstroIrError),
    #[error("{0}")]
    InvalidMacroUsage(String),
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
    lowered_html_interpolations: Vec<super::astro_ir::LoweredAstroHtmlInterpolation>,
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
        inside_lowered_html_interpolation: bool,
    ) -> Result<(), AstroFrameworkError> {
        match node.kind() {
            "html_interpolation" => {
                if inside_lowered_html_interpolation {
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
                            true,
                        )?;
                    }
                    return Ok(());
                }
                context
                    .lowered_html_interpolations
                    .push(lower_html_interpolation_node(source, node)?);
                if is_pure_html_interpolation_expression(node) {
                    return Ok(());
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
                        true,
                    )?;
                }
                return Ok(());
            }
            "element" => {
                if let Some(component) =
                    component_candidate_from_element(source, node, imports, options)?
                {
                    components.push(component);
                    return Ok(());
                }
            }
            "attribute_interpolation" => {
                if inside_lowered_html_interpolation {
                    return Ok(());
                }
                let inner = node
                    .children(&mut node.walk())
                    .find(|child| child.kind() == "attribute_js_expr")
                    .map(Span::from_node)
                    .unwrap_or_else(|| inner_range_from_delimiters(node, 1, 1));
                push_template_expression(
                    source,
                    imports,
                    context,
                    expressions,
                    TemplateExpressionRequest {
                        outer_span: Span::from_node(node),
                        inner_span: inner,
                        language: ScriptLang::Ts,
                        excluded_nested_spans: &[],
                    },
                )?;
                return Ok(());
            }
            "attribute_backtick_string" => {
                if inside_lowered_html_interpolation {
                    return Ok(());
                }
                push_template_expression(
                    source,
                    imports,
                    context,
                    expressions,
                    TemplateExpressionRequest {
                        outer_span: Span::from_node(node),
                        inner_span: inner_range_from_delimiters(node, 1, 1),
                        language: ScriptLang::Ts,
                        excluded_nested_spans: &[],
                    },
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
                inside_lowered_html_interpolation,
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
        false,
    )?;
    push_lowered_html_interpolations(
        imports,
        &mut expressions,
        &context.lowered_html_interpolations,
    )?;
    expressions.sort_by_key(|expression| (expression.outer_span.start, expression.outer_span.end));
    Ok((expressions, components))
}

struct TemplateExpressionRequest<'a> {
    outer_span: Span,
    inner_span: Span,
    language: ScriptLang,
    excluded_nested_spans: &'a [Span],
}

fn push_template_expression(
    source: &str,
    imports: &[MacroImport],
    context: &mut AstroCollectContext,
    expressions: &mut Vec<AstroTemplateExpression>,
    request: TemplateExpressionRequest<'_>,
) -> Result<(), AstroFrameworkError> {
    let TemplateExpressionRequest {
        outer_span,
        inner_span,
        language,
        excluded_nested_spans,
    } = request;
    let expression_source = &source[inner_span.start..inner_span.end];
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, language)?;

    let mut candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Standard,
        &[],
    );
    if !excluded_nested_spans.is_empty() {
        candidates.retain(|candidate| {
            !excluded_nested_spans.iter().any(|span| {
                span.start <= candidate.outer_span.start && span.end >= candidate.outer_span.end
            })
        });
    }
    expressions.push(AstroTemplateExpression {
        outer_span,
        inner_span,
        candidates,
    });
    Ok(())
}

fn push_lowered_html_interpolations(
    imports: &[MacroImport],
    expressions: &mut Vec<AstroTemplateExpression>,
    lowered: &[super::astro_ir::LoweredAstroHtmlInterpolation],
) -> Result<(), AstroFrameworkError> {
    if lowered.is_empty() {
        return Ok(());
    }

    let bundled = bundle_html_interpolations(lowered);
    let tree = parse_typescript(&bundled.code)?;
    let roots = collect_bundled_expression_roots(tree.root_node());
    if roots.len() != bundled.expressions.len() {
        return Err(ParseError::ParseFailed.into());
    }

    for (root, interpolation) in roots.into_iter().zip(bundled.expressions.iter()) {
        let candidates = collect_macro_candidates(
            &bundled.code,
            root,
            imports,
            0,
            JsMacroSyntax::Standard,
            &[],
        )
        .into_iter()
        .filter_map(|candidate| remap_bundled_candidate(candidate, interpolation))
        .collect();

        expressions.push(AstroTemplateExpression {
            outer_span: interpolation.outer_span,
            inner_span: interpolation.inner_span,
            candidates,
        });
    }

    Ok(())
}

fn collect_bundled_expression_roots(root: Node<'_>) -> Vec<Node<'_>> {
    let mut expressions = Vec::new();
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        if !matches!(child.kind(), "lexical_declaration" | "variable_declaration") {
            continue;
        }
        let mut decl_cursor = child.walk();
        for declarator in child.children(&mut decl_cursor) {
            if declarator.kind() != "variable_declarator" {
                continue;
            }
            if let Some(value) = declarator.child_by_field_name("value") {
                expressions.push(value);
            }
        }
    }
    expressions
}

fn remap_bundled_candidate(
    mut candidate: MacroCandidate,
    interpolation: &BundledAstroHtmlInterpolation,
) -> Option<MacroCandidate> {
    candidate.outer_span = interpolation.remap_generated_span(candidate.outer_span)?;
    candidate.normalized_span = interpolation
        .remap_generated_span(candidate.normalized_span)
        .unwrap_or(candidate.outer_span);
    candidate.source_map_anchor = candidate
        .source_map_anchor
        .and_then(|anchor| interpolation.remap_generated_span(anchor));
    Some(candidate)
}

fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
) -> Result<Option<AstroTemplateComponent>, AstroFrameworkError> {
    let mut cursor = node.walk();
    let tag_node = node
        .children(&mut cursor)
        .find(|child| child.kind() == "start_tag" || child.kind() == "self_closing_tag");
    let Some(tag_node) = tag_node else {
        return Ok(None);
    };
    let tag_name_node = tag_node
        .children(&mut tag_node.walk())
        .find(|child| child.kind() == "tag_name");
    let Some(tag_name_node) = tag_name_node else {
        return Ok(None);
    };
    let tag_name = text(source, tag_name_node);
    if !is_component_tag_name(tag_name) {
        return Ok(None);
    }

    let import_decl = imports
        .iter()
        .find(|import_decl| import_decl.local_name == tag_name);
    let Some(import_decl) = import_decl else {
        return Ok(None);
    };
    validate_runtime_lowerable_astro_component(source, node, options)?;
    let normalization_edits =
        collect_component_normalization_edits(source, node, imports, options)?;

    Ok(Some(AstroTemplateComponent {
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
    }))
}

fn component_source_map_anchor(source: &str, node: Node<'_>) -> Option<Span> {
    first_non_whitespace_child_anchor(source, node, &["start_tag", "self_closing_tag", "end_tag"])
        .or(Some(Span::from_node(node)))
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

fn is_macro_module_specifier(specifier: &str, conventions: &FrameworkConventions) -> bool {
    conventions.accepts_macro_package(specifier)
}

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
) -> Result<Vec<NormalizationEdit>, AstroFrameworkError> {
    let mut edits = collect_nested_component_normalization_edits(source, node, imports, options)?;
    edits.extend(component_whitespace_edits(source, node, options));
    sort_and_dedup_normalization_edits(&mut edits);
    Ok(edits)
}

fn collect_nested_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
) -> Result<Vec<NormalizationEdit>, AstroFrameworkError> {
    let mut context = AstroCollectContext::default();
    let mut edits = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "frontmatter_js_block" => {}
            "html_interpolation" => {
                let lowered = lower_html_interpolation_node(source, child)?;
                let tree = parse_typescript(&lowered.code)?;
                let candidates = collect_macro_candidates(
                    &lowered.code,
                    tree.root_node(),
                    imports,
                    0,
                    JsMacroSyntax::Standard,
                    &[],
                );
                for candidate in candidates {
                    edits.extend(remap_lowered_normalization_edits(
                        candidate.normalization_edits,
                        &lowered,
                    ));
                }
            }
            "attribute_interpolation" => {
                let inner = child
                    .children(&mut child.walk())
                    .find(|grandchild| grandchild.kind() == "attribute_js_expr")
                    .map(Span::from_node)
                    .unwrap_or_else(|| inner_range_from_delimiters(child, 1, 1));
                let tree = context
                    .expression_parse_cache
                    .parse(source, inner, ScriptLang::Ts)?;
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
            "attribute_backtick_string" => {
                let inner = inner_range_from_delimiters(child, 1, 1);
                let tree = context
                    .expression_parse_cache
                    .parse(source, inner, ScriptLang::Ts)?;
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
            "element" => {
                if let Some(component) =
                    component_candidate_from_element(source, child, imports, options)?
                {
                    edits.extend(component.candidate.normalization_edits);
                    continue;
                }
                edits.extend(collect_nested_component_normalization_edits(
                    source, child, imports, options,
                )?);
            }
            _ => {
                edits.extend(collect_nested_component_normalization_edits(
                    source, child, imports, options,
                )?);
            }
        }
    }

    Ok(edits)
}

fn remap_lowered_normalization_edits(
    edits: Vec<NormalizationEdit>,
    lowered: &super::astro_ir::LoweredAstroHtmlInterpolation,
) -> Vec<NormalizationEdit> {
    edits
        .into_iter()
        .filter_map(|edit| match edit {
            NormalizationEdit::Delete { span } => {
                remap_lowered_span(lowered, span).map(|span| NormalizationEdit::Delete { span })
            }
            NormalizationEdit::Insert { at, text } => {
                remap_lowered_offset(lowered, at).map(|at| NormalizationEdit::Insert { at, text })
            }
        })
        .collect()
}

fn remap_lowered_span(
    lowered: &super::astro_ir::LoweredAstroHtmlInterpolation,
    span: Span,
) -> Option<Span> {
    let bundled = super::astro_ir::BundledAstroHtmlInterpolation {
        outer_span: lowered.outer_span,
        inner_span: lowered.inner_span,
        synthetic_span: Span::new(0, lowered.code.len()),
        segments: lowered.segments.clone(),
    };
    bundled.remap_generated_span(span)
}

fn remap_lowered_offset(
    lowered: &super::astro_ir::LoweredAstroHtmlInterpolation,
    offset: usize,
) -> Option<usize> {
    lowered.segments.iter().find_map(|segment| {
        if segment.generated.start <= offset && offset <= segment.generated.end {
            Some(segment.original.start + (offset - segment.generated.start))
        } else {
            None
        }
    })
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

    whitespace_replacement_edits(source, &content_children, is_explicit_space_expression)
}

fn is_explicit_space_expression(source: &str, node: Node<'_>) -> bool {
    let span = Span::from_node(node);
    let text = source[span.start..span.end].trim();
    is_explicit_whitespace_string_expression(text)
}

fn validate_runtime_lowerable_astro_component(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), AstroFrameworkError> {
    validate_astro_component_node(source, node, options)
}

fn validate_astro_component_node(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), AstroFrameworkError> {
    if let Some((tag_name, tag_name_span)) = special_astro_tag_name(source, node) {
        return Err(AstroFrameworkError::InvalidMacroUsage(
            format_unsupported_trans_child_syntax(
                source,
                &options.source_name,
                tag_name_span,
                format!("Astro special element `<{tag_name}>`"),
            ),
        ));
    }

    if matches!(node.kind(), "element" | "self_closing_tag") {
        validate_astro_element_like(source, node, options)?;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        validate_astro_component_node(source, child, options)?;
    }

    Ok(())
}

fn special_astro_tag_name<'a>(source: &'a str, node: Node<'_>) -> Option<(&'a str, Span)> {
    let span = Span::from_node(node);
    let source_slice = &source[span.start..span.end];
    if source_slice.starts_with("<style")
        && source_slice
            .as_bytes()
            .get("<style".len())
            .is_none_or(|byte| byte.is_ascii_whitespace() || *byte == b'>')
    {
        return Some(("style", Span::new(span.start + 1, span.start + 6)));
    }

    if source_slice.starts_with("<script")
        && source_slice
            .as_bytes()
            .get("<script".len())
            .is_none_or(|byte| byte.is_ascii_whitespace() || *byte == b'>')
    {
        return Some(("script", Span::new(span.start + 1, span.start + 7)));
    }

    None
}

fn validate_astro_element_like(
    source: &str,
    node: Node<'_>,
    options: &AnalyzeOptions,
) -> Result<(), AstroFrameworkError> {
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

    if let Some((tag_name, tag_name_span)) = astro_tag_name(source, tag)
        && (tag_name == "script" || tag_name == "style")
    {
        return Err(AstroFrameworkError::InvalidMacroUsage(
            format_unsupported_trans_child_syntax(
                source,
                &options.source_name,
                tag_name_span,
                format!("Astro special element `<{tag_name}>`"),
            ),
        ));
    }

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
        if is_unsupported_astro_directive(attribute_name) {
            return Err(AstroFrameworkError::InvalidMacroUsage(
                format_unsupported_trans_child_syntax(
                    source,
                    &options.source_name,
                    Span::from_node(name_node),
                    format!("Astro directive `{attribute_name}`"),
                ),
            ));
        }
    }

    Ok(())
}

fn astro_tag_name<'a>(source: &'a str, tag: Node<'_>) -> Option<(&'a str, Span)> {
    if let Some(tag_name_node) = tag
        .children(&mut tag.walk())
        .find(|child| child.kind() == "tag_name")
    {
        return Some((text(source, tag_name_node), Span::from_node(tag_name_node)));
    }

    let tag_span = Span::from_node(tag);
    let tag_text = &source[tag_span.start..tag_span.end];
    let relative_start = tag_text.find('<')? + 1;
    let relative_end = tag_text[relative_start..]
        .find(|char: char| char.is_ascii_whitespace() || char == '>' || char == '/')
        .map(|offset| relative_start + offset)
        .unwrap_or(tag_text.len());
    if relative_start >= relative_end {
        return None;
    }

    let start = tag_span.start + relative_start;
    let end = tag_span.start + relative_end;
    Some((&source[start..end], Span::new(start, end)))
}

fn is_unsupported_astro_directive(attribute_name: &str) -> bool {
    attribute_name == "is:raw"
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::analyze_astro;
    use crate::conventions::{
        FrameworkConventions, FrameworkKind, MacroConventions, MacroPackage, MacroPackageKind,
        RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions,
    };
    use crate::framework::{AnalyzeOptions, WhitespaceMode};

    fn test_conventions() -> FrameworkConventions {
        FrameworkConventions {
            framework: FrameworkKind::Astro,
            macro_: MacroConventions {
                packages: BTreeMap::from([
                    (
                        MacroPackageKind::Core,
                        MacroPackage {
                            packages: vec!["@lingui/core/macro".to_string()],
                        },
                    ),
                    (
                        MacroPackageKind::Astro,
                        MacroPackage {
                            packages: vec!["lingui-for-astro/macro".to_string()],
                        },
                    ),
                ]),
            },
            runtime: RuntimeConventions {
                package: "lingui-for-astro/runtime".to_string(),
                exports: RuntimeExportConventions {
                    trans: "RuntimeTrans".to_string(),
                    i18n_accessor: None,
                },
            },
            bindings: RuntimeBindingSeeds {
                i18n_accessor_factory: None,
                context: None,
                get_i18n: None,
                translate: None,
                i18n_instance: None,
                runtime_trans_component: "RuntimeTrans".to_string(),
            },
            synthetic: None,
            wrappers: None,
        }
    }

    #[test]
    fn analyzes_macros_inside_html_interpolation_via_astro_ir() {
        let source = r#"---
import { t as translate } from "@lingui/core/macro";
const name = "Ada";
const ready = true;
---
{ready ? <Card title={translate`Hello ${name}`}>{translate`Inner ${name}`}</Card> : null}
"#;

        let analysis = analyze_astro(
            source,
            &AnalyzeOptions {
                source_name: "/virtual/Test.astro".to_string(),
                whitespace: WhitespaceMode::Astro,
                conventions: test_conventions(),
            },
        )
        .expect("analysis succeeds");

        let candidates = analysis
            .template_expressions
            .into_iter()
            .flat_map(|expression| expression.candidates)
            .collect::<Vec<_>>();

        assert_eq!(candidates.len(), 2);
        assert!(candidates.iter().any(|candidate| {
            &source[candidate.outer_span.start..candidate.outer_span.end]
                == "translate`Hello ${name}`"
        }));
        assert!(candidates.iter().any(|candidate| {
            &source[candidate.outer_span.start..candidate.outer_span.end]
                == "translate`Inner ${name}`"
        }));
    }
}
