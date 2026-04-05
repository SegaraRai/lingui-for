use tree_sitter::Node;

use crate::common::{
    NormalizationEdit, ScriptLang, Span, sort_and_dedup_normalization_edits,
    whitespace_replacement_edits,
};

use super::super::shared::helpers::components::first_non_whitespace_child_anchor;
use super::super::shared::helpers::expressions::is_explicit_whitespace_string_expression;
use super::super::shared::helpers::text::{is_component_tag_name, text};
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
        collect_component_normalization_edits(source, node, imports, options, context)?;

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

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut AstroCollectContext,
) -> Result<Vec<NormalizationEdit>, AstroFrameworkError> {
    let mut edits =
        collect_nested_component_normalization_edits(source, node, imports, options, context)?;
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
        &source[inner.start..inner.end],
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
