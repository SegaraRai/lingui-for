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
use super::validation::validate_runtime_lowerable_svelte_component;
use super::walk::{
    SvelteTemplateVisitor, TemplateWalkContext, find_first_descendant, walk_svelte_template,
};
use super::{SvelteFrameworkError, SvelteTemplateComponent};

pub(super) fn component_candidate_from_element(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut TemplateWalkContext,
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
    let tag_name = node_text(source, tag_name_node);
    if !is_component_tag_name(tag_name) {
        return Ok(None);
    }

    if context.shadowed_names().any(|name| name == tag_name) {
        return Ok(None);
    }

    let shadowed_names = context.shadowed_names().cloned().collect::<Vec<_>>();
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
            runtime_component_wrapper_spans: Vec::new(),
        },
        shadowed_names,
    }))
}

fn collect_component_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    options: &AnalyzeOptions,
    context: &mut TemplateWalkContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let org_scope_stack = context.scope_stack.clone();
    let mut visitor = NormalizationVisitor::new(imports, options);
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        walk_svelte_template(source, child, options, context, &mut visitor)?;
    }
    context.scope_stack = org_scope_stack;
    normalization_edits.extend(visitor.finish());
    normalization_edits.extend(component_whitespace_edits(source, node, options));
    Ok(())
}

struct NormalizationVisitor<'a> {
    imports: &'a [MacroImport],
    options: &'a AnalyzeOptions,
    normalization_edits: Vec<NormalizationEdit>,
}

impl<'a> NormalizationVisitor<'a> {
    fn new(imports: &'a [MacroImport], options: &'a AnalyzeOptions) -> Self {
        Self {
            imports,
            options,
            normalization_edits: Vec::new(),
        }
    }
}

impl SvelteTemplateVisitor for NormalizationVisitor<'_> {
    type Output = Vec<NormalizationEdit>;

    fn visit_expression(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError> {
        append_expression_normalization_edits(
            source,
            node,
            self.imports,
            context,
            &mut self.normalization_edits,
        )
    }

    fn visit_raw_text_expression(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError> {
        append_raw_text_expression_normalization_edits(
            source,
            node,
            self.imports,
            context,
            &mut self.normalization_edits,
        )
    }

    fn visit_each_start(
        &mut self,
        source: &str,
        node: Node<'_>,
        context: &mut TemplateWalkContext,
    ) -> Result<(), SvelteFrameworkError> {
        append_raw_text_expression_normalization_edits(
            source,
            node,
            self.imports,
            context,
            &mut self.normalization_edits,
        )
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
            self.normalization_edits
                .extend(candidate.candidate.normalization_edits);
            return Ok(true);
        }
        Ok(false)
    }

    fn finish(self) -> Self::Output {
        self.normalization_edits
    }
}

fn append_expression_normalization_edits(
    source: &str,
    node: Node<'_>,
    imports: &[MacroImport],
    context: &mut TemplateWalkContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "svelte_raw_text")
    else {
        return Ok(());
    };

    let inner_span = Span::from_node(raw_text);
    let expression_source = span_text(source, inner_span);
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;
    let shadowed_names = context.shadowed_names();

    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        shadowed_names,
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
    context: &mut TemplateWalkContext,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let Some(raw_text) = find_first_descendant(node, "svelte_raw_text") else {
        return Ok(());
    };

    let inner_span = Span::from_node(raw_text);
    let expression_source = span_text(source, inner_span);
    let tree = context
        .expression_parse_cache
        .parse(source, inner_span, ScriptLang::Ts)?;
    let shadowed_names = context.shadowed_names();
    let candidates = collect_macro_candidates(
        expression_source,
        tree.root_node(),
        imports,
        inner_span.start,
        JsMacroSyntax::Svelte,
        shadowed_names,
    );
    normalization_edits.extend(
        candidates
            .into_iter()
            .flat_map(|candidate| candidate.normalization_edits.into_iter()),
    );
    match node.kind() {
        "html_tag" => append_virtual_trans_child_wrapper_edits(
            node,
            inner_span,
            "LinguiForSvelteHtml",
            normalization_edits,
        )?,
        "render_tag" => append_virtual_trans_child_wrapper_edits(
            node,
            inner_span,
            "LinguiForSvelteRender",
            normalization_edits,
        )?,
        _ => {}
    }
    Ok(())
}

fn append_virtual_trans_child_wrapper_edits(
    node: Node<'_>,
    inner_span: Span,
    tag_name: &str,
    normalization_edits: &mut Vec<NormalizationEdit>,
) -> Result<(), SvelteFrameworkError> {
    let outer_span = Span::from_node(node);
    if inner_span.start < outer_span.start || inner_span.end > outer_span.end {
        return Err(SvelteFrameworkError::InvalidVirtualTransChildWrapperSpan {
            outer_start: outer_span.start,
            outer_end: outer_span.end,
            inner_start: inner_span.start,
            inner_end: inner_span.end,
        });
    }

    if outer_span.start < inner_span.start {
        normalization_edits.push(NormalizationEdit::Delete {
            span: Span::new_unchecked(outer_span.start, inner_span.start),
        });
    }
    normalization_edits.push(NormalizationEdit::Insert {
        at: outer_span.start,
        text: LeanString::from(format!("<{tag_name} value={{")),
    });

    if inner_span.end < outer_span.end {
        normalization_edits.push(NormalizationEdit::Delete {
            span: Span::new_unchecked(inner_span.end, outer_span.end),
        });
    }
    normalization_edits.push(NormalizationEdit::Insert {
        at: inner_span.end,
        text: LeanString::from_static_str("} />"),
    });
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
    is_explicit_whitespace_string_expression(node_text(source, node).trim())
}
