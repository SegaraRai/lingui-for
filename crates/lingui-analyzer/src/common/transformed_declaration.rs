use std::collections::BTreeMap;

use tree_sitter::Node;

use crate::framework::parse::{ParseError, parse_tsx};

use super::{
    MappedText, MappedTextError, SharedSourceMap, Span, Utf16Index, build_span_anchor_map,
    compute_line_starts, extract_local_submap_indexed, index_source_map,
};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TransformedDeclaration {
    pub(crate) code: String,
    pub(crate) source_map: Option<SharedSourceMap>,
}

#[derive(thiserror::Error, Debug)]
pub enum CollectDeclarationsError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
}

pub(crate) fn collect_variable_initializer_declarations(
    source: &str,
    source_map: Option<&SharedSourceMap>,
) -> Result<BTreeMap<String, TransformedDeclaration>, CollectDeclarationsError> {
    let tree = parse_tsx(source)?;
    let root = tree.root_node();
    let mut declarations = BTreeMap::new();
    let mut cursor = root.walk();
    let line_starts = compute_line_starts(source);
    let source_index = Utf16Index::new(source, &line_starts);
    let indexed_source_map = source_map.map(|map| index_source_map(map));
    for child in root.children(&mut cursor) {
        if child.kind() != "variable_declaration" && child.kind() != "lexical_declaration" {
            continue;
        }

        let mut decl_cursor = child.walk();
        for declarator in child.children(&mut decl_cursor) {
            if declarator.kind() != "variable_declarator" {
                continue;
            }

            let Some(name) = declarator.child_by_field_name("name") else {
                continue;
            };
            if name.kind() != "identifier" {
                continue;
            }
            let Some(value) = declarator.child_by_field_name("value") else {
                continue;
            };
            let value_start = initializer_start_for_declarator(declarator, name, value);
            let raw_code = &source[value_start..value.end_byte()];
            let raw_submap = indexed_source_map.as_ref().and_then(|map| {
                extract_local_submap_indexed(map, &source_index, value_start, value.end_byte())
            });
            let collapse_spans = collect_i18n_comment_whitespace_spans(
                source,
                declarator,
                value_start,
                value.end_byte(),
            );
            let (code, source_map) =
                normalize_i18n_comment_layout_rendered(raw_code, raw_submap, &collapse_spans)?;
            declarations.insert(
                source[name.start_byte()..name.end_byte()].to_string(),
                TransformedDeclaration { code, source_map },
            );
        }
    }

    Ok(declarations)
}

pub(crate) fn initializer_start_for_declarator(
    declarator: Node<'_>,
    name: Node<'_>,
    value: Node<'_>,
) -> usize {
    let mut cursor = declarator.walk();
    let mut saw_equals = false;
    let mut fallback_start = value.start_byte();

    for child in declarator.children(&mut cursor) {
        if child.id() == name.id() {
            continue;
        }

        if child.id() == value.id() {
            return fallback_start.min(value.start_byte());
        }

        if child.kind() == "=" {
            saw_equals = true;
            continue;
        }

        if child.kind() == "comment" {
            if saw_equals {
                return child.start_byte();
            }
            fallback_start = fallback_start.min(child.start_byte());
        }
    }

    fallback_start
}

fn normalize_i18n_comment_layout_rendered(
    input: &str,
    source_map: Option<SharedSourceMap>,
    collapse_spans: &[Span],
) -> Result<(String, Option<SharedSourceMap>), CollectDeclarationsError> {
    if collapse_spans.is_empty() {
        return Ok((input.to_string(), source_map));
    }

    let source_name = source_map
        .as_ref()
        .and_then(|map| map.get_source(0))
        .unwrap_or("__declaration")
        .to_string();
    let original =
        MappedText::from_rendered(source_name.as_str(), input, input.to_string(), source_map);
    let mut mapped = MappedText::new(source_name.as_str(), input);
    let mut cursor = 0usize;

    for span in collapse_spans {
        mapped.append_slice_from(&original, Span::new(cursor, span.start))?;
        if let Some(map) =
            build_span_anchor_map(source_name.as_str(), input, " ", span.start, span.end)
        {
            mapped.push_pre_mapped(" ", map);
        } else {
            mapped.push_unmapped(" ");
        }
        cursor = span.end;
    }

    if cursor < input.len() {
        mapped.append_slice_from(&original, Span::new(cursor, input.len()))?;
    }

    let rendered = mapped.into_rendered()?;
    Ok((rendered.code, rendered.source_map))
}

fn collect_i18n_comment_whitespace_spans(
    source: &str,
    declarator: Node<'_>,
    base_offset: usize,
    limit: usize,
) -> Vec<Span> {
    let mut spans = Vec::new();
    collect_i18n_comment_whitespace_spans_recursive(
        source,
        declarator,
        base_offset,
        base_offset,
        limit,
        &mut spans,
    );
    spans.sort_by_key(|span| (span.start, span.end));
    spans
}

fn collect_i18n_comment_whitespace_spans_recursive(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    declaration_start: usize,
    declaration_end: usize,
    spans: &mut Vec<Span>,
) {
    if node.kind() == "comment"
        && node.start_byte() >= declaration_start
        && node.end_byte() <= declaration_end
        && &source[node.start_byte()..node.end_byte()] == "/*i18n*/"
        && let Some(span) = whitespace_span_before_object(source, node.end_byte(), declaration_end)
    {
        spans.push(Span::new(
            span.start.saturating_sub(base_offset),
            span.end.saturating_sub(base_offset),
        ));
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_i18n_comment_whitespace_spans_recursive(
            source,
            child,
            base_offset,
            declaration_start,
            declaration_end,
            spans,
        );
    }
}

fn whitespace_span_before_object(source: &str, start: usize, limit: usize) -> Option<Span> {
    let bytes = source.as_bytes();
    let mut cursor = start;
    let bounded_limit = limit.min(bytes.len());
    while cursor < bounded_limit && bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }

    if cursor > start && cursor < bounded_limit && source[cursor..].starts_with('{') {
        Some(Span::new(start, cursor))
    } else {
        None
    }
}
#[cfg(test)]
mod tests {
    use super::{
        collect_i18n_comment_whitespace_spans, collect_variable_initializer_declarations,
        initializer_start_for_declarator, normalize_i18n_comment_layout_rendered,
    };
    use crate::framework::parse::parse_tsx;

    #[test]
    fn normalize_i18n_comment_layout_collapses_comment_to_object_spacing() {
        let input = "/*i18n*/\n  \t{ id: \"x\" }";
        let tree = parse_tsx(input).expect("parse succeeds");
        let spans = collect_i18n_comment_whitespace_spans(input, tree.root_node(), 0, input.len());

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None, &spans)
                .expect("rendered normalization succeeds")
                .0,
            "/*i18n*/ { id: \"x\" }",
        );
    }

    #[test]
    fn normalize_i18n_comment_layout_leaves_non_prefix_sequences_untouched() {
        let input = "before /*other*/\n{ value } after";
        let tree = parse_tsx(input).expect("parse succeeds");
        let spans = collect_i18n_comment_whitespace_spans(input, tree.root_node(), 0, input.len());

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None, &spans)
                .expect("rendered normalization succeeds")
                .0,
            input,
        );
    }

    #[test]
    fn normalize_i18n_comment_layout_ignores_marker_inside_string_data() {
        let input = r#""prefix /*i18n*/
  { sample } suffix""#;
        let tree = parse_tsx(input).expect("parse succeeds");
        let spans = collect_i18n_comment_whitespace_spans(input, tree.root_node(), 0, input.len());

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None, &spans)
                .expect("rendered normalization succeeds")
                .0,
            input,
        );
    }

    #[test]
    fn normalize_i18n_comment_layout_ignores_marker_inside_template_data() {
        let input = "String.raw`prefix /*i18n*/\n  { sample } suffix`";
        let tree = parse_tsx(input).expect("parse succeeds");
        let spans = collect_i18n_comment_whitespace_spans(input, tree.root_node(), 0, input.len());

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None, &spans)
                .expect("rendered normalization succeeds")
                .0,
            input,
        );
    }

    #[test]
    fn normalize_i18n_comment_layout_collapses_i18n_comment_inside_call() {
        let input = "render(/*i18n*/\n  { id: \"x\" })";
        let tree = parse_tsx(input).expect("parse succeeds");
        let spans = collect_i18n_comment_whitespace_spans(input, tree.root_node(), 0, input.len());

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None, &spans)
                .expect("rendered normalization succeeds")
                .0,
            "render(/*i18n*/ { id: \"x\" })",
        );
    }

    #[test]
    fn collect_variable_initializer_declarations_normalizes_leading_i18n_comment_object_literals() {
        let input = "const message = /*i18n*/\n  { id: \"x\" };";

        let declarations =
            collect_variable_initializer_declarations(input, None).expect("collection succeeds");

        assert_eq!(
            declarations
                .get("message")
                .expect("message declaration exists")
                .code,
            "/*i18n*/ { id: \"x\" }",
        );
    }

    #[test]
    fn initializer_start_for_declarator_prefers_comment_after_equals() {
        let input = "const message = /*i18n*/\n  { id: \"x\" };";
        let tree = parse_tsx(input).expect("parse succeeds");
        let root = tree.root_node();
        let declarator = root
            .children(&mut root.walk())
            .find(|node| node.kind() == "lexical_declaration")
            .and_then(|decl| {
                decl.children(&mut decl.walk())
                    .find(|child| child.kind() == "variable_declarator")
            })
            .expect("declarator exists");
        let name = declarator.child_by_field_name("name").expect("name exists");
        let value = declarator
            .child_by_field_name("value")
            .expect("value exists");

        assert_eq!(
            &input[initializer_start_for_declarator(declarator, name, value)..value.end_byte()],
            "/*i18n*/\n  { id: \"x\" }"
        );
    }
}
