use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{
    NormalizationEdit, ScriptLang, Span, is_component_tag_name, node_text,
    sort_and_dedup_normalization_edits, span_text, whitespace_replacement_edits,
};

use super::super::shared::helpers::components::first_non_whitespace_child_anchor;
use super::super::shared::helpers::expressions::is_explicit_whitespace_string_expression;
use super::super::shared::js::{JsMacroSyntax, collect_macro_candidates};
use super::super::{
    AnalyzeOptions, MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor,
    MacroImport, WhitespaceMode,
};
use super::analysis::{
    AstroCollectContext, inner_range_from_delimiters, lowered_html_interpolation,
};
use super::validation::validate_runtime_lowerable_astro_component;
use super::{AstroFrameworkError, AstroTemplateComponent};

pub(super) fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
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
    let tag_name = node_text(source, tag_name_node);
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
        collect_component_normalization_edits(source, node, imports, options, context)?;

    Ok(Some(AstroTemplateComponent {
        candidate: MacroCandidate {
            id: LeanString::from(format!("__mc_{}_{}", node.start_byte(), node.end_byte())),
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

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
) -> Result<Vec<NormalizationEdit>, AstroFrameworkError> {
    let mut edits =
        collect_nested_component_normalization_edits(source, node, imports, options, context)?;
    edits.extend(component_astro_child_normalization_edits(source, node));
    edits.extend(component_whitespace_edits(source, node, options));
    sort_and_dedup_normalization_edits(&mut edits);
    Ok(edits)
}

fn collect_nested_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
) -> Result<Vec<NormalizationEdit>, AstroFrameworkError> {
    let mut edits = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "frontmatter_js_block" => {}
            "html_interpolation" => {
                for candidate in lowered_html_interpolation(context, child)?
                    .candidates
                    .iter()
                    .cloned()
                {
                    edits.extend(candidate.normalization_edits);
                }
            }
            "attribute_interpolation" => {
                let inner = child
                    .children(&mut child.walk())
                    .find(|grandchild| grandchild.kind() == "attribute_js_expr")
                    .map(Span::from_node)
                    .unwrap_or_else(|| inner_range_from_delimiters(child, 1, 1));
                parse_and_collect_macros(source, inner, imports, context, &mut edits)?;
            }
            "attribute_backtick_string" => {
                let inner = inner_range_from_delimiters(child, 1, 1);
                parse_and_collect_macros(source, inner, imports, context, &mut edits)?;
            }
            "element" => {
                if let Some(component) =
                    component_candidate_from_element(source, child, imports, options, context)?
                {
                    edits.extend(component.candidate.normalization_edits);
                    continue;
                }
                edits.extend(collect_nested_component_normalization_edits(
                    source, child, imports, options, context,
                )?);
            }
            _ => {
                edits.extend(collect_nested_component_normalization_edits(
                    source, child, imports, options, context,
                )?);
            }
        }
    }

    Ok(edits)
}

fn parse_and_collect_macros(
    source: &str,
    inner: Span,
    imports: &[MacroImport],
    context: &mut AstroCollectContext,
    edits: &mut Vec<NormalizationEdit>,
) -> Result<(), AstroFrameworkError> {
    let tree = context
        .expression_parse_cache
        .parse(source, inner, ScriptLang::Ts)?;
    let candidates = collect_macro_candidates(
        span_text(source, inner),
        tree.root_node(),
        imports,
        inner.start,
        JsMacroSyntax::Standard,
        std::iter::empty::<&str>(),
    );
    for candidate in candidates {
        edits.extend(candidate.normalization_edits);
    }
    Ok(())
}

fn component_astro_child_normalization_edits(
    source: &str,
    node: Node<'_>,
) -> Vec<NormalizationEdit> {
    let mut edits = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "start_tag" | "self_closing_tag" | "end_tag" => {}
            "comment" => edits.push(NormalizationEdit::Delete {
                span: Span::from_node(child),
            }),
            "html_interpolation" => {
                append_html_interpolation_child_normalization_edits(source, child, &mut edits);
            }
            _ => {}
        }
    }

    edits
}

fn append_html_interpolation_child_normalization_edits(
    source: &str,
    node: Node<'_>,
    edits: &mut Vec<NormalizationEdit>,
) {
    let inner = inner_range_from_delimiters(node, 1, 1);
    let children = named_children_in_span(source, node, inner);

    if is_comment_only_interpolation(&children) {
        edits.push(NormalizationEdit::Delete {
            span: Span::from_node(node),
        });
        return;
    }

    if let Some((start_tag, end_tag)) = fragment_root_tag_pair(source, inner, &children) {
        edits.push(NormalizationEdit::Delete {
            span: Span::new(node.start_byte(), inner.start),
        });
        edits.push(NormalizationEdit::Delete {
            span: Span::new(inner.end, node.end_byte()),
        });
        edits.push(NormalizationEdit::Delete {
            span: Span::from_node(start_tag),
        });
        edits.push(NormalizationEdit::Delete {
            span: Span::from_node(end_tag),
        });
        return;
    }

    if is_single_root_interpolation(source, inner, &children)
        && let [root] = children.as_slice()
    {
        edits.push(NormalizationEdit::Delete {
            span: Span::new(node.start_byte(), inner.start),
        });
        edits.push(NormalizationEdit::Delete {
            span: Span::new(inner.end, node.end_byte()),
        });

        if let Some((start_tag, end_tag)) = fragment_tag_pair(*root) {
            edits.push(NormalizationEdit::Delete {
                span: Span::from_node(start_tag),
            });
            edits.push(NormalizationEdit::Delete {
                span: Span::from_node(end_tag),
            });
        }
        return;
    }

    append_comment_expression_normalization_edits(&children, edits);
}

fn append_comment_expression_normalization_edits(
    children: &[Node<'_>],
    edits: &mut Vec<NormalizationEdit>,
) {
    for child in children {
        if child.kind() == "comment" {
            edits.push(NormalizationEdit::Delete {
                span: Span::from_node(*child),
            });
            edits.push(NormalizationEdit::Insert {
                at: child.start_byte(),
                text: LeanString::from_static_str("undefined"),
            });
        }
    }
}

fn named_children_in_span<'a>(source: &str, node: Node<'a>, span: Span) -> Vec<Node<'a>> {
    node.named_children(&mut node.walk())
        .filter(|child| child.end_byte() > span.start && child.start_byte() < span.end)
        .filter(|child| {
            !matches!(child.kind(), "text" | "permissible_text" | "raw_text")
                || !span_text(source, Span::from_node(*child)).trim().is_empty()
        })
        .collect()
}

fn is_comment_only_interpolation(children: &[Node<'_>]) -> bool {
    !children.is_empty() && children.iter().all(|child| child.kind() == "comment")
}

fn is_single_root_interpolation(source: &str, inner: Span, children: &[Node<'_>]) -> bool {
    let [root] = children else {
        return false;
    };
    if !matches!(root.kind(), "element" | "self_closing_tag") {
        return false;
    }

    span_text(source, Span::new(inner.start, root.start_byte()))
        .trim()
        .is_empty()
        && span_text(source, Span::new(root.end_byte(), inner.end))
            .trim()
            .is_empty()
}

fn fragment_root_tag_pair<'a>(
    source: &str,
    inner: Span,
    children: &[Node<'a>],
) -> Option<(Node<'a>, Node<'a>)> {
    let start_tag = children.first().copied()?;
    let end_tag = children.last().copied()?;
    if start_tag.kind() != "start_tag"
        || end_tag.kind() != "end_tag"
        || tag_name(start_tag).is_some()
        || tag_name(end_tag).is_some()
    {
        return None;
    }

    if !span_text(source, Span::new(inner.start, start_tag.start_byte()))
        .trim()
        .is_empty()
        || !span_text(source, Span::new(end_tag.end_byte(), inner.end))
            .trim()
            .is_empty()
    {
        return None;
    }

    Some((start_tag, end_tag))
}

fn fragment_tag_pair(node: Node<'_>) -> Option<(Node<'_>, Node<'_>)> {
    let mut cursor = node.walk();
    let start_tag = node
        .children(&mut cursor)
        .find(|child| child.kind() == "start_tag" && tag_name(*child).is_none())?;
    let mut cursor = node.walk();
    let end_tag = node
        .children(&mut cursor)
        .find(|child| child.kind() == "end_tag" && tag_name(*child).is_none())?;
    Some((start_tag, end_tag))
}

fn tag_name(node: Node<'_>) -> Option<Node<'_>> {
    node.children(&mut node.walk())
        .find(|child| child.kind() == "tag_name")
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
    is_explicit_whitespace_string_expression(node_text(source, node).trim())
}
