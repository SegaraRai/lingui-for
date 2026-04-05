use std::collections::BTreeMap;

use tree_sitter::Node;

use crate::common::{IndexedSourceMap, RenderedMappedText};
use crate::syntax::parse::{ParseError, parse_tsx};

use super::{
    IndexedText, MappedText, MappedTextError, Span, build_span_anchor_map, extract_local_submap,
};

#[derive(thiserror::Error, Debug)]
pub enum CollectDeclarationsError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
}

pub(crate) fn collect_variable_initializer_declarations(
    source: &str,
    indexed_source_map: Option<&IndexedSourceMap>,
) -> Result<BTreeMap<String, RenderedMappedText>, CollectDeclarationsError> {
    let tree = parse_tsx(source)?;
    let root = tree.root_node();
    let mut declarations = BTreeMap::new();
    let mut cursor = root.walk();
    let indexed_source = IndexedText::new(source);
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
            let raw_indexed_submap = indexed_source_map.as_ref().and_then(|map| {
                extract_local_submap(map, &indexed_source, value_start, value.end_byte())
            });
            let collapse_spans = collect_i18n_comment_whitespace_spans(
                source,
                declarator,
                value_start,
                value.end_byte(),
            );
            let rendered = normalize_i18n_comment_layout_rendered(
                raw_code,
                raw_indexed_submap.as_ref(),
                &collapse_spans,
            )?;
            declarations.insert(
                source[name.start_byte()..name.end_byte()].to_string(),
                rendered,
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
    let fallback_start = value.start_byte();

    let mut cursor = declarator.walk();
    let mut saw_name = false;
    let mut saw_equals = false;
    for child in declarator.children(&mut cursor) {
        if !saw_name {
            if child.id() == name.id() {
                saw_name = true;
            }
            continue;
        }

        if child.id() == value.id() {
            break;
        }

        if child.kind() == "=" {
            saw_equals = true;
            continue;
        }

        if child.kind() == "comment" && saw_equals {
            return child.start_byte();
        }
    }

    fallback_start
}

fn normalize_i18n_comment_layout_rendered(
    input: &str,
    source_map: Option<&IndexedSourceMap>,
    collapse_spans: &[Span],
) -> Result<RenderedMappedText, CollectDeclarationsError> {
    if collapse_spans.is_empty() {
        return Ok(RenderedMappedText {
            code: input.to_string(),
            indexed_source_map: source_map.cloned(),
        });
    }

    let source_name = source_map
        .as_ref()
        .and_then(|map| map.source_map().get_source(0))
        .unwrap_or("__declaration")
        .to_string();
    let indexed_input = IndexedText::new(input);
    let original =
        MappedText::from_rendered(source_name.as_str(), input, input.to_string(), source_map);
    let mut mapped = MappedText::new(source_name.as_str(), input);
    let mut cursor = 0usize;

    for span in collapse_spans {
        mapped.append_slice_from(&original, Span::new(cursor, span.start))?;
        mapped.push(
            " ",
            build_span_anchor_map(
                source_name.as_str(),
                &indexed_input,
                " ",
                span.start,
                span.end,
            ),
        );
        cursor = span.end;
    }

    if cursor < input.len() {
        mapped.append_slice_from(&original, Span::new(cursor, input.len()))?;
    }

    mapped.into_rendered().map_err(Into::into)
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
    use crate::syntax::parse::parse_tsx;

    #[test]
    fn normalize_i18n_comment_layout_collapses_comment_to_object_spacing() {
        let input = "/*i18n*/\n  \t{ id: \"x\" }";
        let tree = parse_tsx(input).expect("parse succeeds");
        let spans = collect_i18n_comment_whitespace_spans(input, tree.root_node(), 0, input.len());

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None, &spans)
                .expect("rendered normalization succeeds")
                .code,
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
                .code,
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
                .code,
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
                .code,
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
                .code,
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

    #[test]
    fn initializer_start_for_declarator_ignores_comment_before_equals() {
        let input = "const message /*leading*/ = { id: \"x\" };";
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
            "{ id: \"x\" }"
        );
    }
}
