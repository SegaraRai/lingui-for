use std::collections::BTreeMap;

use crate::framework::parse::{ParseError, parse_tsx};

use super::{
    MappedText, MappedTextError, SharedSourceMap, Span, Utf16Index, compute_line_starts,
    extract_local_submap_indexed, index_source_map,
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
            let value_start = extend_start_for_leading_comments(source, value.start_byte());
            let raw_code = &source[value_start..value.end_byte()];
            let raw_submap = indexed_source_map.as_ref().and_then(|map| {
                extract_local_submap_indexed(map, &source_index, value_start, value.end_byte())
            });
            let (code, source_map) = normalize_i18n_comment_layout_rendered(raw_code, raw_submap)?;
            declarations.insert(
                source[name.start_byte()..name.end_byte()].to_string(),
                TransformedDeclaration { code, source_map },
            );
        }
    }

    Ok(declarations)
}

pub(crate) fn extend_start_for_leading_comments(source: &str, start: usize) -> usize {
    let bytes = source.as_bytes();
    let mut current = start;

    loop {
        let mut cursor = current;
        while cursor > 0 && bytes[cursor - 1].is_ascii_whitespace() {
            cursor -= 1;
        }

        if cursor < 2 || &source[cursor - 2..cursor] != "*/" {
            return current;
        }

        let Some(comment_start) = source[..cursor - 2].rfind("/*") else {
            return current;
        };
        current = comment_start;
    }
}

fn normalize_i18n_comment_layout_rendered(
    input: &str,
    source_map: Option<SharedSourceMap>,
) -> Result<(String, Option<SharedSourceMap>), CollectDeclarationsError> {
    let replacements = collect_whitespace_collapse_spans(input, "/*i18n*/", "{");
    if replacements.is_empty() {
        return Ok((input.to_string(), source_map));
    }

    let mut mapped =
        MappedText::from_rendered("__declaration", input, input.to_string(), source_map);
    for (start, end) in replacements.into_iter().rev() {
        mapped.replace(
            Span::new(start, end),
            MappedText::from_rendered("__declaration", input, " ", None),
        )?;
    }

    let rendered = mapped.into_rendered()?;
    Ok((rendered.code, rendered.source_map))
}

fn collect_whitespace_collapse_spans(input: &str, left: &str, right: &str) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut cursor = 0;

    while let Some(relative) = input[cursor..].find(left) {
        let left_start = cursor + relative;
        let after_left = left_start + left.len();
        let mut whitespace_end = after_left;
        while whitespace_end < input.len() && input.as_bytes()[whitespace_end].is_ascii_whitespace()
        {
            whitespace_end += 1;
        }

        if input[whitespace_end..].starts_with(right) && whitespace_end > after_left {
            spans.push((after_left, whitespace_end));
            cursor = whitespace_end + right.len();
        } else {
            cursor = whitespace_end;
        }
    }

    spans
}
#[cfg(test)]
mod tests {
    use super::{collect_whitespace_collapse_spans, normalize_i18n_comment_layout_rendered};

    #[test]
    fn normalize_i18n_comment_layout_collapses_comment_to_object_spacing() {
        let input = "/*i18n*/\n  \t{ id: \"x\" }";

        assert_eq!(
            normalize_i18n_comment_layout_rendered(input, None)
                .expect("rendered normalization succeeds")
                .0,
            "/*i18n*/ { id: \"x\" }",
        );
    }

    #[test]
    fn collect_whitespace_collapse_spans_leaves_non_matching_sequences_untouched() {
        let input = "before /*other*/\n{ value } after";

        assert!(collect_whitespace_collapse_spans(input, "/*i18n*/", "{").is_empty());
    }
}
