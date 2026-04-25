use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{Span, is_component_tag_name, node_text, span_text};
use crate::syntax::parse::{ParseError, parse_astro, parse_typescript};

#[derive(thiserror::Error, Debug)]
pub enum AstroIrError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error("expected html_interpolation node")]
    ExpectedHtmlInterpolation,
    #[error("missing Astro tag name while lowering interpolation")]
    MissingTagName,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AstroIrSegment {
    pub generated: Span,
    pub original: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoweredAstroHtmlInterpolation {
    pub outer_span: Span,
    pub inner_span: Span,
    pub original: LeanString,
    pub code: LeanString,
    pub segments: Vec<AstroIrSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundledAstroHtmlInterpolation {
    pub declaration_id: LeanString,
    pub outer_span: Span,
    pub inner_span: Span,
    pub synthetic_span: Span,
    pub segments: Vec<AstroIrSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundledAstroHtmlInterpolationModule {
    pub code: LeanString,
    pub expressions: Vec<BundledAstroHtmlInterpolation>,
}

impl BundledAstroHtmlInterpolation {
    pub fn remap_generated_span(&self, span: Span) -> Option<Span> {
        let start = self.remap_generated_offset(span.start, false)?;
        let end = self.remap_generated_offset(span.end, true)?;
        Some(Span::new(start, end.max(start)))
    }

    fn remap_generated_offset(&self, offset: usize, allow_end_boundary: bool) -> Option<usize> {
        self.segments.iter().find_map(|segment| {
            if segment.generated.start <= offset && offset < segment.generated.end {
                return Some(segment.original.start + (offset - segment.generated.start));
            }
            if allow_end_boundary && offset == segment.generated.end {
                return Some(segment.original.end);
            }
            None
        })
    }
}

#[derive(Debug, Default)]
struct AstroIrBuilder {
    code: LeanString,
    segments: Vec<AstroIrSegment>,
}

impl AstroIrBuilder {
    fn push_inserted(&mut self, text: &str) {
        self.code.push_str(text);
    }

    fn push_original(&mut self, source: &str, span: Span) {
        if span.start == span.end {
            return;
        }
        let start = self.code.len();
        self.code.push_str(span_text(source, span));
        self.segments.push(AstroIrSegment {
            generated: span.zeroed().shifted(start),
            original: span,
        });
    }

    fn push_quoted_literal(&mut self, value: &str) {
        self.push_inserted(&format!("{value:?}"));
    }

    fn push_lowered(&mut self, lowered: LoweredNode) {
        let base = self.code.len();
        self.code.push_str(&lowered.code);
        for segment in lowered.segments {
            self.segments.push(AstroIrSegment {
                generated: segment.generated.shifted(base),
                original: segment.original,
            });
        }
    }

    fn finish(self) -> LoweredNode {
        LoweredNode {
            code: self.code,
            segments: self.segments,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LoweredNode {
    code: LeanString,
    segments: Vec<AstroIrSegment>,
}

pub fn lower_astro_html_interpolations(
    source: &str,
) -> Result<Vec<LoweredAstroHtmlInterpolation>, AstroIrError> {
    let tree = parse_astro(source)?;
    let root = tree.root_node();
    let mut lowered = Vec::new();
    collect_html_interpolations(source, root, &mut lowered)?;
    Ok(lowered)
}

pub fn bundle_html_interpolations(
    lowered: &[LoweredAstroHtmlInterpolation],
) -> BundledAstroHtmlInterpolationModule {
    let mut code = LeanString::new();
    let mut expressions = Vec::with_capacity(lowered.len());

    for (index, interpolation) in lowered.iter().enumerate() {
        let declaration_id = LeanString::from(format!("__astro_expr_{index}__"));
        let prefix = format!("const {declaration_id} = (");
        code.push_str(&prefix);
        let synthetic_start = code.len();
        code.push_str(&interpolation.code);
        let synthetic_end = code.len();
        code.push_str(");\n");

        expressions.push(BundledAstroHtmlInterpolation {
            declaration_id,
            outer_span: interpolation.outer_span,
            inner_span: interpolation.inner_span,
            synthetic_span: Span::new(synthetic_start, synthetic_end),
            segments: interpolation
                .segments
                .iter()
                .map(|segment| AstroIrSegment {
                    generated: segment.generated.shifted(synthetic_start),
                    original: segment.original,
                })
                .collect(),
        });
    }

    BundledAstroHtmlInterpolationModule { code, expressions }
}

pub fn lower_html_interpolation_node(
    source: &str,
    node: Node<'_>,
) -> Result<LoweredAstroHtmlInterpolation, AstroIrError> {
    if node.kind() != "html_interpolation" {
        return Err(AstroIrError::ExpectedHtmlInterpolation);
    }

    let outer_span = Span::from_node(node);
    let inner_span = inner_range_from_delimiters(node, 1, 1);
    let lowered = lower_interpolation_expression(source, node)?;
    Ok(LoweredAstroHtmlInterpolation {
        outer_span,
        inner_span,
        original: LeanString::from(span_text(source, inner_span)),
        code: lowered.code,
        segments: lowered.segments,
    })
}

fn collect_html_interpolations(
    source: &str,
    node: Node<'_>,
    lowered: &mut Vec<LoweredAstroHtmlInterpolation>,
) -> Result<(), AstroIrError> {
    if node.kind() == "html_interpolation" {
        lowered.push(lower_html_interpolation_node(source, node)?);
        return Ok(());
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_html_interpolations(source, child, lowered)?;
    }

    Ok(())
}

fn lower_interpolation_expression(
    source: &str,
    interpolation: Node<'_>,
) -> Result<LoweredNode, AstroIrError> {
    let inner_span = inner_range_from_delimiters(interpolation, 1, 1);
    let mut builder = AstroIrBuilder::default();
    let mut cursor = inner_span.start;
    let mut child_cursor = interpolation.walk();
    let children = interpolation
        .named_children(&mut child_cursor)
        .filter(|child| child.end_byte() > inner_span.start && child.start_byte() < inner_span.end)
        .collect::<Vec<_>>();

    for (index, child) in children.iter().enumerate() {
        if cursor < child.start_byte() {
            builder.push_original(source, Span::new(cursor, child.start_byte()));
        }
        if child.kind() == "comment" {
            if should_insert_comment_sequence_separator_before(source, &children, index) {
                builder.push_inserted(", ");
            }
            builder.push_inserted("__astro_cm");
            if should_insert_comment_sequence_separator_after(source, &children, index) {
                builder.push_inserted(", ");
            }
        } else {
            builder.push_lowered(lower_expressionish_child(source, *child)?);
        }
        cursor = child.end_byte();
    }

    if cursor < inner_span.end {
        builder.push_original(source, Span::new(cursor, inner_span.end));
    }

    let lowered = builder.finish();
    let trimmed_code = LeanString::from(lowered.code.trim());
    if trimmed_code.starts_with("...") {
        return Ok(LoweredNode {
            code: LeanString::from_static_str("__astro_spread_child__"),
            segments: Vec::new(),
        });
    }
    if !lowered_code_has_expression_root(&trimmed_code)? {
        return Ok(LoweredNode {
            code: LeanString::from_static_str("undefined"),
            segments: Vec::new(),
        });
    }
    let trimmed_segments = trim_segments(&lowered.code, lowered.segments);
    Ok(LoweredNode {
        code: trimmed_code,
        segments: trimmed_segments,
    })
}

fn should_insert_comment_sequence_separator_before(
    source: &str,
    children: &[Node<'_>],
    index: usize,
) -> bool {
    let comment = children[index];
    let Some(previous) = index.checked_sub(1).map(|previous| children[previous]) else {
        return false;
    };
    previous.kind() != "permissible_text"
        && previous.kind() != "comment"
        && span_text(source, Span::new(previous.end_byte(), comment.start_byte()))
            .trim()
            .is_empty()
}

fn should_insert_comment_sequence_separator_after(
    source: &str,
    children: &[Node<'_>],
    index: usize,
) -> bool {
    let comment = children[index];
    let Some(next) = children.get(index + 1).copied() else {
        return false;
    };
    next.kind() != "permissible_text"
        && next.kind() != "comment"
        && span_text(source, Span::new(comment.end_byte(), next.start_byte()))
            .trim()
            .is_empty()
}

fn lowered_code_has_expression_root(code: &str) -> Result<bool, AstroIrError> {
    let probe = format!("const __astro_probe__ = ({code});");
    let tree = parse_typescript(&probe)?;
    let root = tree.root_node();
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
            if declarator.child_by_field_name("value").is_some() {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

fn trim_segments(raw_code: &str, segments: Vec<AstroIrSegment>) -> Vec<AstroIrSegment> {
    let leading_trim = raw_code.len().saturating_sub(raw_code.trim_start().len());
    let trailing_trim = raw_code.len().saturating_sub(raw_code.trim_end().len());
    let kept_end = raw_code.len().saturating_sub(trailing_trim);
    segments
        .into_iter()
        .filter_map(|segment| {
            let clamped_start = segment.generated.start.max(leading_trim);
            let clamped_end = segment.generated.end.min(kept_end);
            if clamped_start >= clamped_end {
                return None;
            }
            let start = clamped_start - leading_trim;
            let trimmed_end = clamped_end - leading_trim;
            if start >= trimmed_end {
                return None;
            }
            let original_start = segment.original.start + (clamped_start - segment.generated.start);
            let original_end = segment.original.end - (segment.generated.end - clamped_end);
            Some(AstroIrSegment {
                generated: Span::new(start, trimmed_end),
                original: Span::new(original_start, original_end),
            })
        })
        .collect()
}

fn lowered_trimmed_original(source: &str, span: Span) -> LoweredNode {
    let raw = span_text(source, span);
    let code = LeanString::from(raw.trim());
    let segments = trim_segments(
        raw,
        vec![AstroIrSegment {
            generated: Span::new(0, raw.len()),
            original: span,
        }],
    );
    LoweredNode { code, segments }
}

fn lower_expressionish_child(source: &str, node: Node<'_>) -> Result<LoweredNode, AstroIrError> {
    match node.kind() {
        "element" => lower_element_like(source, node),
        "self_closing_tag" => lower_self_closing_tag(source, node),
        "html_interpolation" => lower_interpolation_expression(source, node),
        // Bare spread children like `{...props}` are valid in Astro markup but not in plain
        // TypeScript expressions. Lower them to an opaque placeholder so validation can still
        // run on the original Astro tree without making the analysis IR unparsable.
        "spread_element" => Ok(LoweredNode {
            code: LeanString::from_static_str("__astro_spread_child__"),
            segments: Vec::new(),
        }),
        _ => Ok(LoweredNode {
            code: LeanString::from(node_text(source, node)),
            segments: vec![AstroIrSegment {
                generated: Span::from_node(node).zeroed(),
                original: Span::from_node(node),
            }],
        }),
    }
}

fn lower_element_like(source: &str, node: Node<'_>) -> Result<LoweredNode, AstroIrError> {
    match node.kind() {
        "element" => lower_element(source, node),
        "self_closing_tag" => lower_self_closing_tag(source, node),
        _ => Err(AstroIrError::MissingTagName),
    }
}

fn lower_element(source: &str, node: Node<'_>) -> Result<LoweredNode, AstroIrError> {
    let mut cursor = node.walk();
    let Some(start_or_self_closing_tag) = node
        .children(&mut cursor)
        .find(|child| child.kind() == "start_tag" || child.kind() == "self_closing_tag")
    else {
        return Err(AstroIrError::MissingTagName);
    };
    if start_or_self_closing_tag.kind() == "self_closing_tag" {
        return lower_self_closing_tag(source, start_or_self_closing_tag);
    }

    let mut builder = AstroIrBuilder::default();
    builder.push_inserted("__astro_el(");
    builder.push_lowered(render_tag_expression(source, start_or_self_closing_tag)?);
    builder.push_inserted(", ");
    builder.push_lowered(render_props_expression(source, start_or_self_closing_tag)?);

    let mut child_cursor = node.walk();
    for child in node.children(&mut child_cursor) {
        match child.kind() {
            "start_tag" | "end_tag" => {}
            _ => {
                if let Some(rendered_child) = render_markup_child(source, child)? {
                    builder.push_inserted(", ");
                    builder.push_lowered(rendered_child);
                }
            }
        }
    }

    builder.push_inserted(")");
    Ok(builder.finish())
}

fn lower_self_closing_tag(source: &str, node: Node<'_>) -> Result<LoweredNode, AstroIrError> {
    let mut builder = AstroIrBuilder::default();
    builder.push_inserted("__astro_el(");
    builder.push_lowered(render_tag_expression(source, node)?);
    builder.push_inserted(", ");
    builder.push_lowered(render_props_expression(source, node)?);
    builder.push_inserted(")");
    Ok(builder.finish())
}

fn render_tag_expression(source: &str, tag_node: Node<'_>) -> Result<LoweredNode, AstroIrError> {
    let mut cursor = tag_node.walk();
    let tag_name_node = tag_node
        .children(&mut cursor)
        .find(|child| child.kind() == "tag_name")
        .ok_or(AstroIrError::MissingTagName)?;
    let tag_name = node_text(source, tag_name_node);

    Ok(if is_component_tag_name(tag_name) {
        LoweredNode {
            code: LeanString::from(tag_name),
            segments: vec![AstroIrSegment {
                generated: Span::new(0, tag_name.len()),
                original: Span::from_node(tag_name_node),
            }],
        }
    } else {
        LoweredNode {
            code: LeanString::from(format!("{tag_name:?}")),
            segments: Vec::new(),
        }
    })
}

fn render_props_expression(source: &str, tag_node: Node<'_>) -> Result<LoweredNode, AstroIrError> {
    let mut ordered = Vec::new();
    let mut pending_props = Vec::new();
    let mut cursor = tag_node.walk();
    for child in tag_node.children(&mut cursor) {
        match child.kind() {
            "attribute" => {
                if let Some(prop) = render_attribute(source, child)? {
                    pending_props.push(prop);
                } else if let Some(spread) = render_spread_attribute(source, child) {
                    if !pending_props.is_empty() {
                        ordered.push(lower_props_object(std::mem::take(&mut pending_props)));
                    }
                    ordered.push(spread);
                }
            }
            "spread_attribute" | "attribute_interpolation" => {
                let Some(spread) = render_spread_attribute(source, child) else {
                    continue;
                };
                if !pending_props.is_empty() {
                    ordered.push(lower_props_object(std::mem::take(&mut pending_props)));
                }
                ordered.push(spread);
            }
            _ => {}
        }
    }

    if !pending_props.is_empty() {
        ordered.push(lower_props_object(pending_props));
    }

    if ordered.is_empty() {
        return Ok(LoweredNode {
            code: LeanString::from_static_str("null"),
            segments: Vec::new(),
        });
    }

    if ordered.len() == 1 {
        return Ok(ordered.remove(0));
    }

    let mut builder = AstroIrBuilder::default();
    builder.push_inserted("__astro_merge_props(");
    for (index, item) in ordered.into_iter().enumerate() {
        if index > 0 {
            builder.push_inserted(", ");
        }
        builder.push_lowered(item);
    }
    builder.push_inserted(")");
    Ok(builder.finish())
}

fn lower_props_object(props: Vec<LoweredNode>) -> LoweredNode {
    let mut builder = AstroIrBuilder::default();
    builder.push_inserted("{ ");
    for (index, prop) in props.into_iter().enumerate() {
        if index > 0 {
            builder.push_inserted(", ");
        }
        builder.push_lowered(prop);
    }
    builder.push_inserted(" }");
    builder.finish()
}

fn render_spread_attribute(source: &str, node: Node<'_>) -> Option<LoweredNode> {
    let spread = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "attribute_interpolation")
        .unwrap_or(node);
    let spread = spread
        .children(&mut spread.walk())
        .find(|child| child.kind() == "attribute_js_expr")
        .map(Span::from_node)
        .unwrap_or_else(|| inner_range_from_delimiters(spread, 1, 1));
    let spread = lowered_trimmed_original(source, spread);
    spread
        .code
        .starts_with("...")
        .then(|| trim_leading_dots(spread))
}

fn trim_leading_dots(lowered: LoweredNode) -> LoweredNode {
    let trimmed_code = LeanString::from(lowered.code.trim_start_matches('.'));
    let leading_trim = lowered.code.len().saturating_sub(trimmed_code.len());
    let segments = lowered
        .segments
        .into_iter()
        .filter_map(|segment| {
            let start = segment.generated.start.max(leading_trim);
            let end = segment.generated.end;
            if start >= end {
                return None;
            }
            Some(AstroIrSegment {
                generated: Span::new(start - leading_trim, end - leading_trim),
                original: Span::new(
                    segment.original.start + (start - segment.generated.start),
                    segment.original.end,
                ),
            })
        })
        .collect();
    LoweredNode {
        code: trimmed_code,
        segments,
    }
}

fn render_attribute(
    source: &str,
    attribute: Node<'_>,
) -> Result<Option<LoweredNode>, AstroIrError> {
    let mut cursor = attribute.walk();
    let Some(name_node) = attribute
        .children(&mut cursor)
        .find(|child| child.kind() == "attribute_name")
    else {
        return Ok(None);
    };

    let key = node_text(source, name_node);
    let mut value = None;
    let mut child_cursor = attribute.walk();
    for child in attribute.children(&mut child_cursor) {
        value = match child.kind() {
            "quoted_attribute_value" => Some(render_quoted_attribute_value(source, child)?),
            "attribute_interpolation" => Some(render_attribute_interpolation(source, child)),
            "attribute_backtick_string" => {
                let inner = inner_range_from_delimiters(child, 1, 1);
                Some(LoweredNode {
                    code: LeanString::from(span_text(source, inner)),
                    segments: vec![AstroIrSegment {
                        generated: inner.zeroed(),
                        original: inner,
                    }],
                })
            }
            _ => value,
        };
    }

    let mut builder = AstroIrBuilder::default();
    builder.push_inserted(&format!("{key:?}: "));
    builder.push_lowered(value.unwrap_or(LoweredNode {
        code: LeanString::from_static_str("true"),
        segments: Vec::new(),
    }));
    Ok(Some(builder.finish()))
}

fn render_quoted_attribute_value(
    source: &str,
    node: Node<'_>,
) -> Result<LoweredNode, AstroIrError> {
    let inner = inner_range_from_delimiters(node, 1, 1);
    let mut parts = Vec::new();
    let mut cursor = inner.start;
    let mut child_cursor = node.walk();

    for child in node.named_children(&mut child_cursor) {
        if child.end_byte() <= inner.start || child.start_byte() >= inner.end {
            continue;
        }
        if cursor < child.start_byte() {
            let mut builder = AstroIrBuilder::default();
            builder.push_quoted_literal(&source[cursor..child.start_byte()]);
            parts.push(builder.finish());
        }
        match child.kind() {
            "attribute_interpolation" => parts.push(render_attribute_interpolation(source, child)),
            _ => {
                let mut builder = AstroIrBuilder::default();
                builder.push_quoted_literal(node_text(source, child));
                parts.push(builder.finish());
            }
        }
        cursor = child.end_byte();
    }

    if cursor < inner.end {
        let mut builder = AstroIrBuilder::default();
        builder.push_quoted_literal(&source[cursor..inner.end]);
        parts.push(builder.finish());
    }

    if parts.is_empty() {
        return Ok(LoweredNode {
            code: LeanString::from_static_str("\"\""),
            segments: Vec::new(),
        });
    }

    if parts.len() == 1 {
        return Ok(parts.remove(0));
    }

    let mut builder = AstroIrBuilder::default();
    for (index, part) in parts.into_iter().enumerate() {
        if index > 0 {
            builder.push_inserted(" + ");
        }
        builder.push_lowered(part);
    }
    Ok(builder.finish())
}

fn render_attribute_interpolation(source: &str, node: Node<'_>) -> LoweredNode {
    let inner = node
        .children(&mut node.walk())
        .find(|child| child.kind() == "attribute_js_expr")
        .map(Span::from_node)
        .unwrap_or_else(|| inner_range_from_delimiters(node, 1, 1));
    lowered_trimmed_original(source, inner)
}

fn render_markup_child(source: &str, node: Node<'_>) -> Result<Option<LoweredNode>, AstroIrError> {
    match node.kind() {
        "element" | "self_closing_tag" => lower_element_like(source, node).map(Some),
        "html_interpolation" => Ok(Some(lower_interpolation_expression(source, node)?)),
        "permissible_text" => {
            let value = node_text(source, node);
            if value.is_empty() {
                Ok(None)
            } else {
                let mut builder = AstroIrBuilder::default();
                builder.push_quoted_literal(value);
                Ok(Some(builder.finish()))
            }
        }
        "comment" => Ok(None),
        _ => {
            let value = node_text(source, node);
            if value.trim().is_empty() {
                Ok(None)
            } else {
                let mut builder = AstroIrBuilder::default();
                builder.push_quoted_literal(value);
                Ok(Some(builder.finish()))
            }
        }
    }
}

fn inner_range_from_delimiters(node: Node<'_>, prefix_len: usize, suffix_len: usize) -> Span {
    let start = node.start_byte().saturating_add(prefix_len);
    let end = node.end_byte().saturating_sub(suffix_len).max(start);
    Span { start, end }
}

#[cfg(test)]
mod tests {
    use indoc::indoc;

    use crate::common::Span;

    use super::{bundle_html_interpolations, lower_astro_html_interpolations};

    #[test]
    fn lowers_nested_markup_inside_html_interpolation_to_astro_el_calls() {
        let source = indoc! {r#"
            ---
            const bar = 1;
            const baz = 2;
            ---
            {foo ? <A x={bar}><B />{baz}</A> : qux}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");
        assert_eq!(lowered.len(), 1);
        assert_eq!(
            lowered[0].code,
            r#"foo ? __astro_el(A, { "x": bar }, __astro_el(B, null), baz) : qux"#
        );
    }

    #[test]
    fn lowers_quoted_attribute_interpolations_inside_markup() {
        let source = indoc! {r#"
            ---
            const href = "/docs";
            const label = "Read";
            ---
            {<a title={`prefix ${label}`} href={href}>Docs</a>}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");
        assert_eq!(lowered.len(), 1);
        assert_eq!(
            lowered[0].code,
            r#"__astro_el("a", { "title": `prefix ${label}`, "href": href }, "Docs")"#
        );
    }

    #[test]
    fn preserves_attribute_and_spread_order_in_props_expression() {
        let source = indoc! {r#"
            ---
            const a = { first: 1 };
            const b = { second: 2 };
            const c = "tail";
            ---
            {<Component foo="head" {...a} bar={b} {...b} baz={c} />}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");
        assert_eq!(lowered.len(), 1);
        assert_eq!(
            lowered[0].code,
            r#"__astro_el(Component, __astro_merge_props({ "foo": "head" }, a, { "bar": b }, b, { "baz": c }))"#
        );
    }

    #[test]
    fn lowers_bare_spread_children_to_opaque_placeholders() {
        let source = indoc! {r#"
            ---
            const props = { name: "Ada" };
            ---
            {<Trans>Hello {...props}</Trans>}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");
        assert_eq!(lowered.len(), 1);
        assert_eq!(
            lowered[0].code,
            r#"__astro_el(Trans, null, "Hello", __astro_spread_child__)"#
        );
    }

    #[test]
    fn remaps_generated_offsets_back_to_original_spans() {
        let source = indoc! {r#"
            ---
            const bar = 1;
            const baz = 2;
            ---
            {foo ? <A x={bar}><B />{baz}</A> : qux}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");
        let bundled = bundle_html_interpolations(&lowered);
        let expression = &bundled.expressions[0];
        let generated = bundled.code.find("bar").expect("bar exists");
        let original = source.rfind("bar").expect("interpolation bar exists");
        assert_eq!(
            expression.remap_generated_span(Span::new(generated, generated + 3)),
            Some(Span::new(original, original + 3))
        );
    }

    #[test]
    fn lowers_comment_only_interpolations_to_opaque_expression() {
        let source = indoc! {r#"
            ---
            const x = 1;
            ---
            {/* This is just a code comment */}
            {<!-- This is an HTML comment -->}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");

        assert_eq!(lowered.len(), 2);
        assert_eq!(lowered[0].code, "undefined");
        assert_eq!(lowered[1].code, "__astro_cm");
    }

    #[test]
    fn lowers_html_comments_inside_interpolations_using_astro_parse_tree() {
        let source = indoc! {r#"
            ---
            const x = 1;
            ---
            {<!-- This is an HTML comment --><span>{translate`Inside element`}</span>}
            {condition ? <!-- This is an HTML comment --> : <span>{translate`Fallback`}</span>}
        "#};

        let lowered = lower_astro_html_interpolations(source).expect("lowering succeeds");

        assert_eq!(lowered.len(), 2);
        assert_eq!(
            lowered[0].code,
            r#"__astro_cm, __astro_el("span", null, translate`Inside element`)"#
        );
        assert_eq!(
            lowered[1].code,
            r#"condition ? __astro_cm : __astro_el("span", null, translate`Fallback`)"#
        );
    }
}
