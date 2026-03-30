use std::collections::BTreeSet;

use sourcemap::{SourceMap, SourceMapBuilder};
use tree_sitter::Node;

use crate::common::{Span, Utf16Index};
use crate::framework::parse::parse_tsx;

use super::SharedSourceMap;
use super::mapped_text::{MappedText, MappedTextError, RenderedMappedText};
use super::primitives::{compute_line_starts, project_original_anchors_to_generated};

#[derive(Debug, Clone)]
pub(crate) struct FinalizedReplacement<'a> {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: &'a str,
    pub(crate) source_map: Option<SharedSourceMap>,
    pub(crate) original_anchors: Vec<usize>,
}

pub(crate) fn build_span_anchor_map(
    source_name: &str,
    source_text: &str,
    generated_text: &str,
    original_span_start: usize,
    original_span_end: usize,
) -> Option<SharedSourceMap> {
    if generated_text.is_empty() {
        return None;
    }

    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source_text));
    let line_starts = compute_line_starts(source_text);
    let source_index = Utf16Index::new(source_text, &line_starts);

    let start_byte = original_span_start.min(source_text.len());
    let end_byte = original_span_end.min(source_text.len());
    let (start_line, start_col) = source_index.byte_to_line_utf16_col(start_byte);
    builder.add(
        0,
        0,
        start_line as u32,
        start_col as u32,
        Some(source_name),
        None::<&str>,
        false,
    );

    let (end_generated_line, end_generated_col) = generated_end_position(generated_text);
    if (end_generated_line > 0 || end_generated_col > 0) && start_byte != end_byte {
        let (end_line, end_col) = source_index.byte_to_line_utf16_col(end_byte);
        builder.add(
            end_generated_line,
            end_generated_col,
            end_line as u32,
            end_col as u32,
            Some(source_name),
            None::<&str>,
            false,
        );
    }
    Some(builder.into_sourcemap().into())
}

pub(crate) fn build_copy_map(
    source_name: &str,
    source_text: &str,
    original_span: Span,
    source_anchors: &[usize],
) -> Option<SharedSourceMap> {
    if original_span.start >= original_span.end || original_span.end > source_text.len() {
        return None;
    }

    let copied_text = &source_text[original_span.start..original_span.end];
    let anchor_points = collect_copy_anchor_points(copied_text, original_span, source_anchors);
    if anchor_points.is_empty() {
        return None;
    }

    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source_text));
    let source_line_starts = compute_line_starts(source_text);
    let source_index = Utf16Index::new(source_text, &source_line_starts);
    let generated_line_starts = compute_line_starts(copied_text);
    let generated_index = Utf16Index::new(copied_text, &generated_line_starts);

    for anchor in anchor_points {
        let generated_byte = anchor - original_span.start;
        let (src_line, src_col) = source_index.byte_to_line_utf16_col(anchor);
        let (dst_line, dst_col) = generated_index.byte_to_line_utf16_col(generated_byte);
        builder.add(
            dst_line as u32,
            dst_col as u32,
            src_line as u32,
            src_col as u32,
            Some(source_name),
            None::<&str>,
            false,
        );
    }

    Some(builder.into_sourcemap().into())
}

pub(crate) fn indent_rendered_text<'a>(
    source_name: &'a str,
    source_text: &'a str,
    rendered: RenderedMappedText,
    indent: &str,
) -> Result<RenderedMappedText, MappedTextError> {
    let RenderedMappedText { code, source_map } = rendered;

    if indent.is_empty() || !code.contains('\n') {
        return Ok(RenderedMappedText { code, source_map });
    }

    let line_spans = code
        .split_inclusive('\n')
        .scan(0usize, |offset, line| {
            let start = *offset;
            *offset += line.len();
            Some((start, *offset, line == "\n"))
        })
        .collect::<Vec<_>>();

    let source = MappedText::from_rendered(source_name, source_text, code, source_map);
    let mut output = MappedText::new(source_name, source_text);

    for (index, (start, end, is_blank_line)) in line_spans.into_iter().enumerate() {
        if index > 0 && !is_blank_line {
            output.push_unmapped(indent);
        }
        output.append(source.slice(Span::new(start, end))?)?;
    }

    output.into_rendered()
}

pub(crate) fn build_final_output(
    source_name: &str,
    source_text: &str,
    source_anchors: &[usize],
    replacements: &[FinalizedReplacement<'_>],
) -> Result<RenderedMappedText, MappedTextError> {
    let mut output = MappedText::new(source_name, source_text);
    let mut cursor = 0usize;

    for replacement in replacements {
        if replacement.start < cursor {
            continue;
        }

        if cursor < replacement.start {
            push_source_slice(
                &mut output,
                source_name,
                source_text,
                Span::new(cursor, replacement.start),
                source_anchors,
            );
        }

        output.append(finalize_replacement_mapped(
            source_name,
            source_text,
            replacement,
        )?)?;
        cursor = replacement.end;
    }

    if cursor < source_text.len() {
        push_source_slice(
            &mut output,
            source_name,
            source_text,
            Span::new(cursor, source_text.len()),
            source_anchors,
        );
    }

    output.into_rendered()
}

fn generated_end_position(text: &str) -> (u32, u32) {
    let mut line = 0u32;
    let mut col = 0u32;
    for chunk in text.split_inclusive('\n') {
        if chunk.ends_with('\n') {
            line += 1;
            col = 0;
        } else {
            col += chunk.encode_utf16().count() as u32;
        }
    }
    (line, col)
}

fn push_source_slice(
    output: &mut MappedText<'_>,
    source_name: &str,
    source_text: &str,
    span: Span,
    source_anchors: &[usize],
) {
    let text = &source_text[span.start..span.end];
    if let Some(map) = build_copy_map(source_name, source_text, span, source_anchors) {
        output.push_pre_mapped(text, map);
    } else {
        output.push_unmapped(text);
    }
}

fn finalize_replacement_mapped<'a>(
    source_name: &'a str,
    source_text: &'a str,
    replacement: &FinalizedReplacement<'_>,
) -> Result<MappedText<'a>, MappedTextError> {
    let source_map = replacement
        .source_map
        .as_ref()
        .map(|map| {
            augment_replacement_map(
                map,
                source_name,
                source_text,
                replacement.code,
                replacement.start,
                replacement.end,
                &replacement.original_anchors,
            )
        })
        .transpose()?;

    Ok(MappedText::from_rendered(
        source_name,
        source_text,
        replacement.code.to_string(),
        source_map,
    ))
}

fn augment_replacement_map(
    map: &SourceMap,
    source_name: &str,
    source_text: &str,
    generated_text: &str,
    original_start: usize,
    original_end: usize,
    original_anchors: &[usize],
) -> Result<SharedSourceMap, MappedTextError> {
    let line_starts = compute_line_starts(source_text);
    let source_index = Utf16Index::new(source_text, &line_starts);
    let mut anchor_positions = vec![
        source_index.byte_to_line_utf16_col(original_start),
        source_index.byte_to_line_utf16_col(original_end),
    ];
    anchor_positions.extend(
        original_anchors
            .iter()
            .map(|anchor| source_index.byte_to_line_utf16_col(*anchor)),
    );
    let anchor_positions = anchor_positions
        .into_iter()
        .map(|(line, col)| (line as u32, col as u32))
        .collect::<Vec<_>>();
    let projected = project_original_anchors_to_generated(map, &anchor_positions);

    let mut builder = SourceMapBuilder::new(map.get_file());
    builder.set_file(map.get_file());
    builder.set_source_root(map.get_source_root());

    for src_id in 0..map.get_source_count() {
        let Some(source) = map.get_source(src_id) else {
            continue;
        };
        let builder_src_id = builder.add_source(source);
        builder.set_source_contents(builder_src_id, map.get_source_contents(src_id));
    }

    let mut extras = projected;
    let (end_generated_line, end_generated_col) = generated_end_position(generated_text);
    extras.push((
        0,
        0,
        anchor_positions[0].0,
        anchor_positions[0].1,
        Some(source_name.to_string()),
    ));
    extras.push((
        end_generated_line,
        end_generated_col,
        anchor_positions[1].0,
        anchor_positions[1].1,
        Some(source_name.to_string()),
    ));

    let existing_positions = map
        .tokens()
        .map(|token| (token.get_dst_line(), token.get_dst_col()))
        .collect::<BTreeSet<_>>();
    let mut extras = extras
        .into_iter()
        .filter(|(dst_line, dst_col, _, _, _)| !existing_positions.contains(&(*dst_line, *dst_col)))
        .collect::<Vec<_>>();
    extras.sort_by_key(|(dst_line, dst_col, _, _, _)| (*dst_line, *dst_col));
    let mut extras = extras.into_iter().peekable();

    for token in map.tokens() {
        while let Some((dst_line, dst_col, src_line, src_col, source)) = extras.peek() {
            if (*dst_line, *dst_col) < (token.get_dst_line(), token.get_dst_col()) {
                builder.add(
                    *dst_line,
                    *dst_col,
                    *src_line,
                    *src_col,
                    source.as_deref().or(Some(source_name)),
                    None::<&str>,
                    false,
                );
                extras.next();
            } else {
                break;
            }
        }

        if let Some(source) = token.get_source() {
            builder.add(
                token.get_dst_line(),
                token.get_dst_col(),
                token.get_src_line(),
                token.get_src_col(),
                Some(source),
                token.get_name(),
                false,
            );
        }
    }

    for (dst_line, dst_col, src_line, src_col, source) in extras {
        builder.add(
            dst_line,
            dst_col,
            src_line,
            src_col,
            source.as_deref().or(Some(source_name)),
            None::<&str>,
            false,
        );
    }

    Ok(builder.into_sourcemap().into())
}

fn collect_copy_anchor_points(
    copied_text: &str,
    original_span: Span,
    source_anchors: &[usize],
) -> Vec<usize> {
    let mut anchors = BTreeSet::from([original_span.start, original_span.end]);
    anchors.extend(
        source_anchors
            .iter()
            .copied()
            .filter(|anchor| *anchor > original_span.start && *anchor < original_span.end),
    );

    if anchors.len() <= 2 {
        anchors.extend(
            collect_snippet_anchors(copied_text)
                .into_iter()
                .map(|anchor| original_span.start + anchor)
                .filter(|anchor| *anchor > original_span.start && *anchor < original_span.end),
        );
    }

    anchors.into_iter().collect()
}

fn collect_snippet_anchors(source: &str) -> Vec<usize> {
    let mut anchors = BTreeSet::new();
    if !source.is_empty() {
        anchors.insert(0);
        anchors.insert(source.len());
    }

    let wrapped = format!("const __lf = ({source});");
    let Ok(tree) = parse_tsx(&wrapped) else {
        return anchors.into_iter().collect();
    };
    let root = tree.root_node();
    let Some(declarator) = find_first_named_descendant(root, "variable_declarator") else {
        return anchors.into_iter().collect();
    };
    let Some(value) = declarator.child_by_field_name("value") else {
        return anchors.into_iter().collect();
    };
    let snippet_node = if value.kind() == "parenthesized_expression" {
        first_named_child(value).unwrap_or(value)
    } else {
        value
    };
    extend_relative_node_start_anchors(snippet_node, snippet_node.start_byte(), &mut anchors);
    anchors.into_iter().collect()
}

fn extend_relative_node_start_anchors(root: Node<'_>, base: usize, anchors: &mut BTreeSet<usize>) {
    let mut cursor = root.walk();
    let mut stack = vec![root];

    while let Some(node) = stack.pop() {
        if node.end_byte() > node.start_byte() && node.start_byte() >= base {
            anchors.insert(node.start_byte() - base);
        }

        let mut children = node.children(&mut cursor).collect::<Vec<_>>();
        children.reverse();
        stack.extend(children);
    }
}

fn find_first_named_descendant<'a>(root: Node<'a>, kind: &str) -> Option<Node<'a>> {
    let mut cursor = root.walk();
    let mut stack = vec![root];

    while let Some(node) = stack.pop() {
        if node.kind() == kind {
            return Some(node);
        }

        let mut children = node.children(&mut cursor).collect::<Vec<_>>();
        children.reverse();
        stack.extend(children);
    }

    None
}

fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).next()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use sourcemap::SourceMapBuilder;

    use super::indent_rendered_text;
    use crate::common::RenderedMappedText;

    fn identity_map(source_name: &str, source_text: &str) -> Arc<sourcemap::SourceMap> {
        let mut builder = SourceMapBuilder::new(Some(source_name));
        builder.set_file(Some(source_name));
        let src_id = builder.add_source(source_name);
        builder.set_source_contents(src_id, Some(source_text));

        builder.add(0, 0, 0, 0, Some(source_name), None::<&str>, false);
        builder.add(1, 0, 1, 0, Some(source_name), None::<&str>, false);
        builder.add(1, 4, 1, 4, Some(source_name), None::<&str>, false);
        Arc::new(builder.into_sourcemap())
    }

    #[test]
    fn indents_multiline_rendered_text_via_unmapped_prefixes() {
        let source_name = "test.ts";
        let source_text = "alpha\nbeta";
        let rendered = RenderedMappedText {
            code: source_text.to_string(),
            source_map: Some(identity_map(source_name, source_text)),
        };

        let indented =
            indent_rendered_text(source_name, source_text, rendered, "  ").expect("indent works");

        assert_eq!(indented.code, "alpha\n  beta");
        let map = indented.source_map.expect("map preserved");
        let token = map.lookup_token(1, 2).expect("second line token");
        assert_eq!(token.get_src_line(), 1);
        assert_eq!(token.get_src_col(), 0);
    }
}
