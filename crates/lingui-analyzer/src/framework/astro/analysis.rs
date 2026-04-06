use std::collections::HashMap;

use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{
    EmbeddedScriptKind, EmbeddedScriptRegion, NormalizationEdit, ScriptLang, Span, node_text,
    span_text, unquote,
};
use crate::conventions::FrameworkConventions;
use crate::syntax::parse::{ParseError, parse_astro, parse_typescript};

use super::super::shared::helpers::anchors::{
    collect_node_start_anchors, extend_shifted_node_start_anchors,
};
use super::super::shared::helpers::imports::collect_import_specifiers_from_node;
use super::super::shared::js::{
    ExpressionParseCache, JsMacroSyntax, collect_macro_candidates,
    collect_top_level_declared_names_from_root,
};
use super::super::{AnalyzeOptions, MacroCandidate, MacroImport};
use super::components::component_candidate_from_element;
use super::ir::{
    BundledAstroHtmlInterpolation, bundle_html_interpolations, lower_astro_html_interpolations,
};
use super::{
    AstroFrameworkError, AstroFrontmatterAnalysis, AstroSemanticAnalysis, AstroSourceMetadata,
    AstroTemplateComponent, AstroTemplateExpression,
};

#[derive(Debug, Default)]
pub(super) struct AstroCollectContext {
    pub(super) expression_parse_cache: ExpressionParseCache,
    lowered_html_interpolations: HashMap<Span, LoweredAstroHtmlInterpolationAnalysis>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct LoweredAstroHtmlInterpolationAnalysis {
    pub(super) outer_span: Span,
    pub(super) inner_span: Span,
    pub(super) candidates: Vec<MacroCandidate>,
}

pub fn analyze_astro(
    source: &str,
    options: &AnalyzeOptions,
) -> Result<AstroFrontmatterAnalysis, AstroFrameworkError> {
    let astro_tree = parse_astro(source)?;
    let root = astro_tree.root_node();
    let mut source_anchors = collect_node_start_anchors(source, root);
    let frontmatter = find_frontmatter(root);

    let (
        macro_imports,
        frontmatter_declared_names,
        frontmatter_import_statement_spans,
        frontmatter_candidates,
    ) = if let Some(frontmatter_region) = &frontmatter {
        let frontmatter_source = span_text(source, frontmatter_region.inner_span);
        let frontmatter_tree = parse_typescript(frontmatter_source)?;
        extend_shifted_node_start_anchors(
            frontmatter_source,
            frontmatter_tree.root_node(),
            frontmatter_region.inner_span.start,
            &mut source_anchors,
        );
        let frontmatter_root = frontmatter_tree.root_node();
        let declared_names =
            collect_top_level_declared_names_from_root(frontmatter_source, frontmatter_root);
        let macro_imports = collect_macro_imports(
            frontmatter_source,
            frontmatter_root,
            frontmatter_region.inner_span.start,
            &options.conventions,
        );
        let import_statement_spans = collect_macro_import_statement_spans_from_root(
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
            std::iter::empty::<&str>(),
        );
        (
            macro_imports,
            declared_names,
            import_statement_spans,
            candidates,
        )
    } else {
        (Vec::new(), Vec::new(), Vec::new(), Vec::new())
    };

    let (template_expressions, template_components) =
        collect_template_expressions(source, root, &macro_imports, options)?;

    Ok(AstroFrontmatterAnalysis {
        semantic: AstroSemanticAnalysis {
            macro_imports,
            frontmatter_declared_names,
            frontmatter_candidates,
            template_expressions,
            template_components,
        },
        metadata: AstroSourceMetadata {
            frontmatter,
            frontmatter_import_statement_spans,
            source_anchors,
        },
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
        let Some(module_specifier) = unquote(node_text(source, source_node)) else {
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

    imports
}

fn collect_macro_import_statement_spans_from_root(
    source: &str,
    root: Node<'_>,
    base_offset: usize,
    conventions: &FrameworkConventions,
) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        if child.kind() != "import_statement" {
            continue;
        }
        let Some(source_node) = child.child_by_field_name("source") else {
            continue;
        };
        let Some(module_specifier) = unquote(node_text(source, source_node)) else {
            continue;
        };
        if !conventions.accepts_macro_package(module_specifier) {
            continue;
        }

        let mut end = child.end_byte();
        while matches!(source.as_bytes().get(end), Some(b'\r' | b'\n')) {
            end += 1;
        }
        spans.push(Span::new(
            base_offset + child.start_byte(),
            base_offset + end,
        ));
    }

    spans
}

fn collect_template_expressions(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
) -> Result<(Vec<AstroTemplateExpression>, Vec<AstroTemplateComponent>), AstroFrameworkError> {
    #[derive(Default)]
    struct TemplateCollections {
        expressions: Vec<AstroTemplateExpression>,
        components: Vec<AstroTemplateComponent>,
    }

    let mut context = AstroCollectContext {
        expression_parse_cache: ExpressionParseCache::default(),
        lowered_html_interpolations: analyze_lowered_html_interpolations(source, imports)?,
    };
    fn collect_template_expressions_impl(
        source: &str,
        node: Node<'_>,
        imports: &[MacroImport],
        options: &AnalyzeOptions,
        context: &mut AstroCollectContext,
        collected: &mut TemplateCollections,
        inside_lowered_html_interpolation: bool,
    ) -> Result<(), AstroFrameworkError> {
        match node.kind() {
            "html_interpolation" => {
                if inside_lowered_html_interpolation {
                    let mut cursor = node.walk();
                    for child in node.children(&mut cursor) {
                        collect_template_expressions_impl(
                            source, child, imports, options, context, collected, true,
                        )?;
                    }
                    return Ok(());
                }
                let lowered = lowered_html_interpolation(context, node)?;
                collected.expressions.push(AstroTemplateExpression {
                    outer_span: lowered.outer_span,
                    inner_span: lowered.inner_span,
                    candidates: lowered.candidates.clone(),
                });
                if is_pure_html_interpolation_expression(node) {
                    return Ok(());
                }
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    collect_template_expressions_impl(
                        source, child, imports, options, context, collected, true,
                    )?;
                }
                return Ok(());
            }
            "element" => {
                if let Some(component) =
                    component_candidate_from_element(source, node, imports, options, context)?
                {
                    collected.components.push(component);
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
                    &mut collected.expressions,
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
                    &mut collected.expressions,
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
                collected,
                inside_lowered_html_interpolation,
            )?;
        }

        Ok(())
    }

    let mut collected = TemplateCollections::default();
    collect_template_expressions_impl(
        source,
        node,
        imports,
        options,
        &mut context,
        &mut collected,
        false,
    )?;
    collected
        .expressions
        .sort_by_key(|expression| (expression.outer_span.start, expression.outer_span.end));
    Ok((collected.expressions, collected.components))
}

fn analyze_lowered_html_interpolations(
    source: &str,
    imports: &[MacroImport],
) -> Result<HashMap<Span, LoweredAstroHtmlInterpolationAnalysis>, AstroFrameworkError> {
    let lowered = lower_astro_html_interpolations(source)?;
    if lowered.is_empty() {
        return Ok(HashMap::new());
    }

    let bundled = bundle_html_interpolations(&lowered);
    let tree = parse_typescript(&bundled.code)?;
    let roots = collect_bundled_expression_roots(tree.root_node());
    if roots.len() != bundled.expressions.len() {
        return Err(AstroFrameworkError::BundledRootCountMismatch {
            expected: bundled.expressions.len(),
            found: roots.len(),
        });
    }

    let mut analyses = HashMap::with_capacity(bundled.expressions.len());
    for (root, interpolation) in roots.into_iter().zip(bundled.expressions.iter()) {
        let candidates = collect_macro_candidates(
            &bundled.code,
            root,
            imports,
            0,
            JsMacroSyntax::Standard,
            std::iter::empty::<&str>(),
        )
        .into_iter()
        .filter_map(|candidate| remap_bundled_candidate(candidate, interpolation))
        .collect();
        analyses.insert(
            interpolation.outer_span,
            LoweredAstroHtmlInterpolationAnalysis {
                outer_span: interpolation.outer_span,
                inner_span: interpolation.inner_span,
                candidates,
            },
        );
    }

    Ok(analyses)
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
    let expression_source = span_text(source, inner_span);
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, language)?;

    let mut candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Standard,
        std::iter::empty::<&str>(),
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
    candidate.normalization_edits =
        remap_bundled_normalization_edits(candidate.normalization_edits, interpolation);
    candidate.outer_span = interpolation.remap_generated_span(candidate.outer_span)?;
    candidate.normalized_span = interpolation
        .remap_generated_span(candidate.normalized_span)
        .unwrap_or(candidate.outer_span);
    candidate.source_map_anchor = candidate
        .source_map_anchor
        .and_then(|anchor| interpolation.remap_generated_span(anchor));
    Some(candidate)
}

fn remap_bundled_normalization_edits(
    edits: Vec<NormalizationEdit>,
    interpolation: &BundledAstroHtmlInterpolation,
) -> Vec<NormalizationEdit> {
    edits
        .into_iter()
        .filter_map(|edit| match edit {
            NormalizationEdit::Delete { span } => interpolation
                .remap_generated_span(span)
                .map(|span| NormalizationEdit::Delete { span }),
            NormalizationEdit::Insert { at, text } => remap_bundled_offset(interpolation, at)
                .map(|at| NormalizationEdit::Insert { at, text }),
        })
        .collect()
}

fn remap_bundled_offset(
    interpolation: &BundledAstroHtmlInterpolation,
    offset: usize,
) -> Option<usize> {
    interpolation.segments.iter().find_map(|segment| {
        if segment.generated.start <= offset && offset < segment.generated.end {
            return Some(segment.original.start + (offset - segment.generated.start));
        }
        // Normalization inserts target whitespace gaps, so boundary offsets should map to the preceding segment end.
        if offset == segment.generated.end {
            return Some(segment.original.end);
        }
        None
    })
}

pub(super) fn lowered_html_interpolation<'a>(
    context: &'a AstroCollectContext,
    node: Node<'_>,
) -> Result<&'a LoweredAstroHtmlInterpolationAnalysis, AstroFrameworkError> {
    context
        .lowered_html_interpolations
        .get(&Span::from_node(node))
        .ok_or(ParseError::ParseFailed.into())
}

pub(super) fn inner_range_from_delimiters(
    node: Node<'_>,
    prefix_len: usize,
    suffix_len: usize,
) -> Span {
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

#[cfg(test)]
mod tests {
    use super::remap_bundled_offset;
    use crate::common::Span;
    use crate::framework::astro::ir::{AstroIrSegment, BundledAstroHtmlInterpolation};

    #[test]
    fn remap_bundled_offset_handles_segment_boundaries_deterministically() {
        let interpolation = BundledAstroHtmlInterpolation {
            outer_span: Span::new(0, 0),
            inner_span: Span::new(0, 0),
            synthetic_span: Span::new(0, 0),
            segments: vec![
                AstroIrSegment {
                    generated: Span::new(0, 3),
                    original: Span::new(10, 13),
                },
                AstroIrSegment {
                    generated: Span::new(3, 6),
                    original: Span::new(20, 23),
                },
            ],
        };

        assert_eq!(remap_bundled_offset(&interpolation, 3), Some(13));
    }
}
