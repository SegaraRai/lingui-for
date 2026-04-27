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
use super::markup::{
    fragment_root_tag_pair, is_comment_only_interpolation, is_fragment_wrapper,
    is_rich_node_expression_interpolation, is_single_root_interpolation, named_children_in_span,
};
use super::validation::validate_runtime_lowerable_astro_component;
use super::{AstroFrameworkError, AstroTemplateComponent};

const ASTRO_COMMENT_MARKER: &str = "<__astro_cm />";
const ASTRO_FRAGMENT_START_MARKER: &str = "<__astro_frag>";
const ASTRO_FRAGMENT_END_MARKER: &str = "</__astro_frag>";

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
    let normalization_edits = collect_component_normalization_edits(
        source,
        node,
        imports,
        options,
        context,
        import_decl,
    )?;
    let runtime_component_wrapper_spans =
        collect_runtime_component_wrapper_spans(source, node, import_decl.imported_name.as_str());

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
            runtime_component_wrapper_spans,
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
    import_decl: &MacroImport,
) -> Result<Vec<NormalizationEdit>, AstroFrameworkError> {
    let mut edits =
        collect_nested_component_normalization_edits(source, node, imports, options, context)?;
    edits.extend(component_astro_child_normalization_edits(
        source,
        node,
        import_decl,
    ));
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
    import_decl: &MacroImport,
) -> Vec<NormalizationEdit> {
    let mut edits = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "start_tag" | "self_closing_tag" | "end_tag" => {}
            "comment" => replace_with_astro_comment_marker(child, &mut edits),
            "html_interpolation" => {
                append_html_interpolation_child_normalization_edits(
                    source,
                    child,
                    import_decl,
                    &mut edits,
                );
            }
            _ => append_comment_marker_replacements(child, &mut edits),
        }
    }

    edits
}

pub(crate) fn collect_runtime_component_wrapper_spans(
    source: &str,
    node: Node<'_>,
    imported_name: &str,
) -> Vec<Span> {
    if imported_name != "Trans" {
        return Vec::new();
    }

    let mut spans = Vec::new();
    for child in node.children(&mut node.walk()) {
        match child.kind() {
            "start_tag" | "self_closing_tag" | "end_tag" => {}
            _ => collect_runtime_component_wrapper_child_spans(source, child, &mut spans),
        }
    }
    spans
}

fn collect_runtime_component_wrapper_child_spans(
    source: &str,
    node: Node<'_>,
    spans: &mut Vec<Span>,
) {
    match node.kind() {
        "element" => {
            if is_fragment_wrapper(source, node) {
                spans.push(Span::from_node(node));
                for child in node.children(&mut node.walk()) {
                    collect_runtime_component_wrapper_child_spans(source, child, spans);
                }
                return;
            }

            if let Some(self_closing_tag) = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "self_closing_tag")
            {
                if has_content_hole(source, self_closing_tag)
                    || !is_skipped_runtime_component_wrapper(source, self_closing_tag)
                {
                    spans.push(Span::from_node(self_closing_tag));
                }
                return;
            }

            if has_content_hole(source, node) {
                spans.push(Span::from_node(node));
                return;
            }
            if is_skipped_runtime_component_wrapper(source, node) {
                return;
            }

            spans.push(Span::from_node(node));
            for child in node.children(&mut node.walk()) {
                collect_runtime_component_wrapper_child_spans(source, child, spans);
            }
        }
        "self_closing_tag" => {
            if has_content_hole(source, node) || !is_skipped_runtime_component_wrapper(source, node)
            {
                spans.push(Span::from_node(node));
            }
        }
        "comment" => spans.push(Span::from_node(node)),
        "html_interpolation" => {
            let inner = inner_range_from_delimiters(node, 1, 1);
            let children = named_children_in_span(source, node, inner);
            if is_rich_node_expression_interpolation(source, inner, &children) {
                spans.push(Span::from_node(node));
            } else {
                for child in node.children(&mut node.walk()) {
                    collect_runtime_component_wrapper_child_spans(source, child, spans);
                }
            }
        }
        _ => {
            for child in node.children(&mut node.walk()) {
                collect_runtime_component_wrapper_child_spans(source, child, spans);
            }
        }
    }
}

fn is_skipped_runtime_component_wrapper(source: &str, node: Node<'_>) -> bool {
    matches!(
        runtime_tag_name(source, node),
        Some("Plural" | "Select" | "SelectOrdinal" | "Trans")
    )
}

fn has_content_hole(source: &str, node: Node<'_>) -> bool {
    node.children(&mut node.walk()).any(|child| {
        matches!(
            (
                attribute_name(source, child),
                attribute_value(source, child)
            ),
            (Some("set:html" | "set:text"), _)
                | (
                    Some("set"),
                    Some("html" | "text" | "\"html\"" | "\"text\"" | "'html'" | "'text'")
                )
        )
    })
}

fn runtime_tag_name<'a>(source: &'a str, node: Node<'_>) -> Option<&'a str> {
    match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag")
            .and_then(|start_tag| {
                start_tag
                    .children(&mut start_tag.walk())
                    .find(|child| child.kind() == "tag_name")
            })
            .map(|tag_name| node_text(source, tag_name)),
        "self_closing_tag" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "tag_name")
            .map(|tag_name| node_text(source, tag_name)),
        _ => None,
    }
}

fn attribute_name<'a>(source: &'a str, node: Node<'_>) -> Option<&'a str> {
    if !matches!(node.kind(), "attribute" | "directive_attribute") {
        return None;
    }
    node.children(&mut node.walk())
        .find(|child| {
            matches!(
                child.kind(),
                "attribute_name" | "directive_name" | "property_identifier"
            )
        })
        .map(|name| node_text(source, name))
}

fn attribute_value<'a>(source: &'a str, node: Node<'_>) -> Option<&'a str> {
    node.children(&mut node.walk())
        .find(|child| matches!(child.kind(), "quoted_attribute_value" | "attribute_value"))
        .map(|value| node_text(source, value).trim())
}

fn append_html_interpolation_child_normalization_edits(
    source: &str,
    node: Node<'_>,
    import_decl: &MacroImport,
    edits: &mut Vec<NormalizationEdit>,
) {
    let inner = inner_range_from_delimiters(node, 1, 1);
    let children = named_children_in_span(source, node, inner);

    if is_comment_only_interpolation(&children) {
        replace_span_with_text(
            Span::from_node(node),
            LeanString::from_static_str(ASTRO_COMMENT_MARKER),
            edits,
        );
        return;
    }

    if let Some((start_tag, end_tag)) = fragment_root_tag_pair(source, inner, &children) {
        edits.push(NormalizationEdit::Delete {
            span: Span::new_unchecked(node.start_byte(), inner.start),
        });
        edits.push(NormalizationEdit::Delete {
            span: Span::new_unchecked(inner.end, node.end_byte()),
        });
        replace_with_astro_fragment_start_marker(start_tag, edits);
        replace_with_astro_fragment_end_marker(end_tag, edits);
        append_descendant_comment_marker_replacements(start_tag, end_tag, edits);
        return;
    }

    if is_single_root_interpolation(source, inner, &children) {
        let root = children[0];
        edits.push(NormalizationEdit::Delete {
            span: Span::new_unchecked(node.start_byte(), inner.start),
        });
        edits.push(NormalizationEdit::Delete {
            span: Span::new_unchecked(inner.end, node.end_byte()),
        });

        if let Some((start_tag, end_tag)) = fragment_tag_pair(root) {
            replace_with_astro_fragment_start_marker(start_tag, edits);
            replace_with_astro_fragment_end_marker(end_tag, edits);
            append_descendant_comment_marker_replacements(start_tag, end_tag, edits);
        } else {
            append_comment_marker_replacements(root, edits);
        }
        return;
    }

    if import_decl.imported_name == "Trans"
        && is_rich_node_expression_interpolation(source, inner, &children)
    {
        // Keep node-bearing Astro expressions as one rich placeholder. The
        // runtime adapter restores the original expression as the matching
        // static slot, so nested nodes are not extracted here.
        replace_span_with_text(
            Span::from_node(node),
            LeanString::from_static_str("<Fragment />"),
            edits,
        );
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
            replace_with_astro_comment_marker(*child, edits);
        } else {
            append_comment_marker_replacements(*child, edits);
        }
    }
}

fn append_comment_marker_replacements(node: Node<'_>, edits: &mut Vec<NormalizationEdit>) {
    if node.kind() == "comment" {
        replace_with_astro_comment_marker(node, edits);
        return;
    }

    for child in node.named_children(&mut node.walk()) {
        append_comment_marker_replacements(child, edits);
    }
}

fn append_descendant_comment_marker_replacements(
    start_tag: Node<'_>,
    end_tag: Node<'_>,
    edits: &mut Vec<NormalizationEdit>,
) {
    let Some(parent) = start_tag.parent() else {
        return;
    };

    for child in parent.named_children(&mut parent.walk()) {
        if child.start_byte() < start_tag.end_byte() || child.end_byte() > end_tag.start_byte() {
            continue;
        }
        append_comment_marker_replacements(child, edits);
    }
}

fn replace_with_astro_comment_marker(node: Node<'_>, edits: &mut Vec<NormalizationEdit>) {
    replace_span_with_text(
        Span::from_node(node),
        LeanString::from_static_str(ASTRO_COMMENT_MARKER),
        edits,
    );
}

fn replace_with_astro_fragment_start_marker(node: Node<'_>, edits: &mut Vec<NormalizationEdit>) {
    replace_span_with_text(
        Span::from_node(node),
        LeanString::from_static_str(ASTRO_FRAGMENT_START_MARKER),
        edits,
    );
}

fn replace_with_astro_fragment_end_marker(node: Node<'_>, edits: &mut Vec<NormalizationEdit>) {
    replace_span_with_text(
        Span::from_node(node),
        LeanString::from_static_str(ASTRO_FRAGMENT_END_MARKER),
        edits,
    );
}

fn replace_span_with_text(span: Span, text: LeanString, edits: &mut Vec<NormalizationEdit>) {
    edits.push(NormalizationEdit::Delete { span });
    edits.push(NormalizationEdit::Insert {
        at: span.start,
        text,
    });
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
