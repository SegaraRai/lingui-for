use std::collections::BTreeSet;

use sourcemap::SourceMapBuilder;
use tree_sitter::Node;

use crate::common::{IndexedSourceMap, IndexedText, Span};
use crate::framework::parse::parse_tsx;

use super::mapped_text::{MappedText, MappedTextError, RenderedMappedText};
use super::primitives::{OriginalAnchorProjection, project_original_anchors_to_generated};

#[derive(Debug, Clone)]
pub(crate) struct FinalizedReplacement<'a> {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: &'a str,
    pub(crate) indexed_source_map: Option<IndexedSourceMap>,
    pub(crate) original_anchors: Vec<usize>,
}

pub(crate) fn build_span_anchor_map(
    source_name: &str,
    source: &IndexedText<'_>,
    generated_text: &str,
    original_span_start: usize,
    original_span_end: usize,
) -> Option<IndexedSourceMap> {
    if generated_text.is_empty() {
        return None;
    }

    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source.as_str()));

    let start_byte = original_span_start.min(source.len());
    let end_byte = original_span_end.min(source.len());
    let (start_line, start_col) = source.byte_to_line_utf16_col(start_byte)?;
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
        let (end_line, end_col) = source.byte_to_line_utf16_col(end_byte)?;
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
    Some(IndexedSourceMap::new(builder.into_sourcemap()))
}

pub(crate) fn build_copy_map(
    source_name: &str,
    source: &IndexedText<'_>,
    original_span: Span,
    source_anchors: &[usize],
) -> Option<IndexedSourceMap> {
    if original_span.start >= original_span.end || original_span.end > source.len() {
        return None;
    }

    let copied = source.slice(original_span.start..original_span.end)?;
    let copied_text = copied.as_str();
    let anchor_points = collect_copy_anchor_points(copied_text, original_span, source_anchors);
    if anchor_points.is_empty() {
        return None;
    }

    let mut builder = SourceMapBuilder::new(Some(source_name));
    builder.set_file(Some(source_name));
    let src_id = builder.add_source(source_name);
    builder.set_source_contents(src_id, Some(source.as_str()));

    for anchor in anchor_points {
        let generated_byte = anchor - original_span.start;
        let (src_line, src_col) = source.byte_to_line_utf16_col(anchor)?;
        let (dst_line, dst_col) = copied.byte_to_line_utf16_col(generated_byte)?;
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

    Some(IndexedSourceMap::new(builder.into_sourcemap()))
}

pub(crate) fn indent_rendered_text(
    rendered: RenderedMappedText,
    indent: &str,
) -> Result<RenderedMappedText, MappedTextError> {
    if indent.is_empty() || !rendered.code.contains('\n') {
        return Ok(rendered);
    }

    let RenderedMappedText {
        code,
        indexed_source_map,
    } = rendered;

    let mut indented =
        String::with_capacity(code.len() + indent.len() * code.matches('\n').count());
    let mut should_indent_line = Vec::new();
    for (index, line) in code.split_inclusive('\n').enumerate() {
        let is_blank_line = line.trim_matches(['\r', '\n']).is_empty();
        let should_indent = index > 0 && !is_blank_line;
        should_indent_line.push(should_indent);
        if should_indent {
            indented.push_str(indent);
        }
        indented.push_str(line);
    }
    if !code.ends_with('\n') {
        let tail = code.rsplit('\n').next().unwrap_or(code.as_str());
        let should_indent = code.contains('\n') && !tail.trim_matches('\r').is_empty();
        if should_indent_line.len() < code.split('\n').count() {
            should_indent_line.push(should_indent);
        }
    }

    let Some(map) = indexed_source_map else {
        return Ok(RenderedMappedText {
            code: indented,
            indexed_source_map: None,
        });
    };
    let map = map.source_map();

    let indent_utf16 = indent.encode_utf16().count() as u32;
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

    for token in map.tokens() {
        let Some(source) = token.get_source() else {
            continue;
        };
        let dst_line = token.get_dst_line();
        let dst_col = if should_indent_line
            .get(dst_line as usize)
            .copied()
            .unwrap_or(false)
        {
            token.get_dst_col() + indent_utf16
        } else {
            token.get_dst_col()
        };
        builder.add(
            dst_line,
            dst_col,
            token.get_src_line(),
            token.get_src_col(),
            Some(source),
            token.get_name(),
            false,
        );
    }

    let indexed_source_map = IndexedSourceMap::new(builder.into_sourcemap());

    Ok(RenderedMappedText {
        code: indented,
        indexed_source_map: Some(indexed_source_map),
    })
}

pub(crate) fn build_final_output(
    source_name: &str,
    source_text: &str,
    source_anchors: &[usize],
    replacements: &[FinalizedReplacement<'_>],
) -> Result<RenderedMappedText, MappedTextError> {
    let source = IndexedText::new(source_text);
    let mut output = MappedText::new(source_name, source_text);
    let mut cursor = 0usize;

    for replacement in replacements {
        if replacement.start > replacement.end
            || replacement.end > source_text.len()
            || replacement.start < cursor
        {
            return Err(MappedTextError::InvalidReplacement {
                start: replacement.start,
                end: replacement.end,
                cursor,
                source_len: source_text.len(),
            });
        }

        if cursor < replacement.start {
            push_source_slice(
                &mut output,
                source_name,
                &source,
                Span::new(cursor, replacement.start),
                source_anchors,
            )?;
        }

        output.append(finalize_replacement_mapped(
            source_name,
            &source,
            replacement,
        )?)?;
        cursor = replacement.end;
    }

    if cursor < source_text.len() {
        push_source_slice(
            &mut output,
            source_name,
            &source,
            Span::new(cursor, source_text.len()),
            source_anchors,
        )?;
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
    source: &IndexedText<'_>,
    span: Span,
    source_anchors: &[usize],
) -> Result<(), MappedTextError> {
    let text = source
        .as_str()
        .get(span.start..span.end)
        .ok_or(MappedTextError::InvalidSegmentSlice)?;
    if let Some(map) = build_copy_map(source_name, source, span, source_anchors) {
        output.push_pre_mapped(text, map);
    } else {
        output.push_unmapped(text);
    }
    Ok(())
}

fn finalize_replacement_mapped<'a>(
    source_name: &'a str,
    source: &'a IndexedText<'a>,
    replacement: &FinalizedReplacement<'_>,
) -> Result<MappedText<'a>, MappedTextError> {
    let source_map = replacement
        .indexed_source_map
        .as_ref()
        .map(|map| {
            augment_replacement_map(
                map,
                source_name,
                source,
                replacement.code,
                replacement.start,
                replacement.end,
                &replacement.original_anchors,
            )
        })
        .transpose()?;

    Ok(MappedText::from_rendered(
        source_name,
        source.as_str(),
        replacement.code.to_string(),
        source_map.as_ref(),
    ))
}

fn augment_replacement_map(
    indexed_map: &IndexedSourceMap,
    source_name: &str,
    source: &IndexedText<'_>,
    generated_text: &str,
    original_start: usize,
    original_end: usize,
    original_anchors: &[usize],
) -> Result<IndexedSourceMap, MappedTextError> {
    let map = indexed_map.source_map();
    let mut anchor_positions = vec![
        source.byte_to_line_utf16_col(original_start),
        source.byte_to_line_utf16_col(original_end),
    ];
    anchor_positions.extend(
        original_anchors
            .iter()
            .map(|anchor| source.byte_to_line_utf16_col(*anchor)),
    );
    let anchor_positions = anchor_positions
        .into_iter()
        .collect::<Option<Vec<_>>>()
        .ok_or(MappedTextError::OutOfBounds)?
        .into_iter()
        .map(|(line, col)| (line as u32, col as u32))
        .collect::<Vec<_>>();
    let projected = project_original_anchors_to_generated(indexed_map, &anchor_positions);

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
    extras.push(OriginalAnchorProjection {
        dst_line: 0,
        dst_col: 0,
        src_line: anchor_positions[0].0,
        src_col: anchor_positions[0].1,
        source: Some(source_name.to_string()),
    });
    extras.push(OriginalAnchorProjection {
        dst_line: end_generated_line,
        dst_col: end_generated_col,
        src_line: anchor_positions[1].0,
        src_col: anchor_positions[1].1,
        source: Some(source_name.to_string()),
    });

    let mut extras = extras
        .into_iter()
        .filter(|projection| !indexed_map.has_dst_position(projection.dst_line, projection.dst_col))
        .collect::<Vec<_>>();
    extras.sort_by_key(|projection| (projection.dst_line, projection.dst_col));
    let mut extras = extras.into_iter().peekable();

    for token in map.tokens() {
        while let Some(projection) = extras.peek() {
            if (projection.dst_line, projection.dst_col)
                < (token.get_dst_line(), token.get_dst_col())
            {
                builder.add(
                    projection.dst_line,
                    projection.dst_col,
                    projection.src_line,
                    projection.src_col,
                    projection.source.as_deref().or(Some(source_name)),
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

    for projection in extras {
        builder.add(
            projection.dst_line,
            projection.dst_col,
            projection.src_line,
            projection.src_col,
            projection.source.as_deref().or(Some(source_name)),
            None::<&str>,
            false,
        );
    }

    Ok(IndexedSourceMap::new(builder.into_sourcemap()))
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
    use sourcemap::SourceMapBuilder;

    use super::{FinalizedReplacement, build_final_output, indent_rendered_text};
    use crate::common::{IndexedSourceMap, MappedTextError, RenderedMappedText};

    fn identity_map(source_name: &str, source_text: &str) -> IndexedSourceMap {
        let mut builder = SourceMapBuilder::new(Some(source_name));
        builder.set_file(Some(source_name));
        let src_id = builder.add_source(source_name);
        builder.set_source_contents(src_id, Some(source_text));

        builder.add(0, 0, 0, 0, Some(source_name), None::<&str>, false);
        builder.add(1, 0, 1, 0, Some(source_name), None::<&str>, false);
        builder.add(1, 4, 1, 4, Some(source_name), None::<&str>, false);
        IndexedSourceMap::new(builder.into_sourcemap())
    }

    #[test]
    fn indents_multiline_rendered_text_via_unmapped_prefixes() {
        let source_name = "test.ts";
        let source_text = "alpha\nbeta";
        let rendered = RenderedMappedText {
            code: source_text.to_string(),
            indexed_source_map: Some(identity_map(source_name, source_text)),
        };

        let indented = indent_rendered_text(rendered, "  ").expect("indent works");

        assert_eq!(indented.code, "alpha\n  beta");
        let map = indented.indexed_source_map.expect("map preserved");
        let map = map.source_map();
        let token = map.lookup_token(1, 2).expect("second line token");
        assert_eq!(token.get_src_line(), 1);
        assert_eq!(token.get_src_col(), 0);
    }

    #[test]
    fn rejects_overlapping_replacements_in_final_output() {
        let source_text = "abcdef";
        let replacements = vec![
            FinalizedReplacement {
                start: 1,
                end: 3,
                code: "X",
                indexed_source_map: None,
                original_anchors: Vec::new(),
            },
            FinalizedReplacement {
                start: 2,
                end: 4,
                code: "Y",
                indexed_source_map: None,
                original_anchors: Vec::new(),
            },
        ];

        let error = build_final_output("test.ts", source_text, &[], &replacements)
            .expect_err("overlapping replacements should fail");

        assert!(matches!(
            error,
            MappedTextError::InvalidReplacement {
                start: 2,
                end: 4,
                cursor: 3,
                source_len: 6,
            }
        ));
    }

    #[test]
    fn rejects_out_of_bounds_replacements_in_final_output() {
        let source_text = "abcdef";
        let replacements = vec![FinalizedReplacement {
            start: 4,
            end: 7,
            code: "X",
            indexed_source_map: None,
            original_anchors: Vec::new(),
        }];

        let error = build_final_output("test.ts", source_text, &[], &replacements)
            .expect_err("out-of-bounds replacements should fail");

        assert!(matches!(
            error,
            MappedTextError::InvalidReplacement {
                start: 4,
                end: 7,
                cursor: 0,
                source_len: 6,
            }
        ));
    }
}
