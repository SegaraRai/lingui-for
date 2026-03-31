use tree_sitter::Node;

use crate::common::{
    MappedText, MappedTextError, RenderedMappedText, SharedSourceMap, Span, Utf16Index,
    build_span_anchor_map, compute_line_starts,
};
use crate::framework::parse::{ParseError, parse_tsx};

#[derive(thiserror::Error, Debug)]
pub enum RuntimeComponentError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
    #[error("missing variable declarator for transformed component")]
    MissingVariableDeclaratorForTransformedComponent,
    #[error("missing initializer for transformed component")]
    MissingInitializerForTransformedComponent,
    #[error("expected JSX element initializer for transformed component")]
    ExpectedJsxElementInitializerForTransformedComponent,
    #[error("unsupported JSX attribute node kind: {kind}")]
    UnsupportedJsxAttributeNodeKind { kind: String },
    #[error("expected spread element inside JSX spread attribute")]
    ExpectedSpreadElementInJsxSpreadAttribute,
    #[error("missing JSX attribute name")]
    MissingJsxAttributeName,
    #[error("unsupported JSX attribute value kind: {kind}")]
    UnsupportedJsxAttributeValueKind { kind: String },
    #[error("missing variable declarator while lowering object expression")]
    MissingVariableDeclaratorWhileLoweringObjectExpression,
    #[error("missing object expression initializer")]
    MissingObjectExpressionInitializer,
    #[error("Runtime Trans components must lower from an object expression")]
    ExpectedObjectExpressionForRuntimeTransComponents,
    #[error("missing object pair key")]
    MissingObjectPairKey,
    #[error("missing object pair value")]
    MissingObjectPairValue,
    #[error("missing spread argument in object expression")]
    MissingSpreadArgumentInObjectExpression,
    #[error("unsupported object child kind in runtime component lowering: {kind}")]
    UnsupportedObjectChildKind { kind: String },
    #[error("expected JSX element descriptor")]
    ExpectedJsxElementDescriptor,
    #[error("missing JSX name in component descriptor")]
    MissingJsxNameInComponentDescriptor,
    #[error("missing spread child in JSX props")]
    MissingSpreadChildInJsxProps,
    #[error("missing spread argument in JSX props")]
    MissingSpreadArgumentInJsxProps,
    #[error("missing JSX prop name")]
    MissingJsxPropName,
    #[error("missing JSX expression value")]
    MissingJsxExpressionValue,
    #[error("unsupported JSX prop kind: {kind}")]
    UnsupportedJsxPropKind { kind: String },
    #[error("translated node offset became negative")]
    TranslatedNodeOffsetNegative,
}

pub(crate) fn lower_runtime_component_markup(
    source_name: &str,
    original_source: &str,
    declaration: RenderedMappedText,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let declaration_source_map = declaration.source_map.clone();
    let source = declaration.code;
    let mapped_input = MappedText::from_rendered(
        source_name,
        original_source,
        source.clone(),
        declaration.source_map,
    );
    let wrapper_prefix = "const __lf = ";
    let wrapped = format!("{wrapper_prefix}{source};");
    let tree = parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator")
        .ok_or(RuntimeComponentError::MissingVariableDeclaratorForTransformedComponent)?;
    let value = declarator
        .child_by_field_name("value")
        .ok_or(RuntimeComponentError::MissingInitializerForTransformedComponent)?;

    convert_runtime_trans_root(
        original_source,
        declaration_source_map.as_ref(),
        &source,
        &mapped_input,
        value,
        -(wrapper_prefix.len() as isize),
        runtime_component_name,
    )
}

fn convert_runtime_trans_root(
    original_source: &str,
    declaration_source_map: Option<&SharedSourceMap>,
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or(RuntimeComponentError::ExpectedJsxElementInitializerForTransformedComponent)?;

    let mut mapped = input.empty_like();
    let root_span = translated_span(node, base_offset)?;
    push_anchor_mapped(
        &mut mapped,
        declaration_source_map,
        source,
        original_source,
        "<",
        root_span.start,
    );
    push_anchor_mapped(
        &mut mapped,
        declaration_source_map,
        source,
        original_source,
        runtime_component_name,
        root_span.start,
    );
    append_rendered(
        &mut mapped,
        collect_jsx_attributes(source, input, opening, base_offset)?,
    );
    push_anchor_mapped(
        &mut mapped,
        declaration_source_map,
        source,
        original_source,
        " />",
        root_span.end,
    );
    mapped.into_rendered().map_err(RuntimeComponentError::from)
}

fn push_anchor_mapped(
    mapped: &mut MappedText<'_>,
    declaration_source_map: Option<&SharedSourceMap>,
    declaration_source: &str,
    original_source: &str,
    text: &str,
    declaration_byte: usize,
) {
    let Some(original_byte) = project_declaration_byte_to_original_byte(
        declaration_source_map,
        declaration_source,
        original_source,
        declaration_byte,
    ) else {
        mapped.push_unmapped(text);
        return;
    };
    let Some(map) = build_span_anchor_map(
        mapped.source_name(),
        mapped.source_text(),
        text,
        original_byte,
        original_byte,
    ) else {
        mapped.push_unmapped(text);
        return;
    };
    mapped.push_pre_mapped(text, map);
}

fn project_declaration_byte_to_original_byte(
    declaration_source_map: Option<&SharedSourceMap>,
    declaration_source: &str,
    original_source: &str,
    declaration_byte: usize,
) -> Option<usize> {
    let source_map = declaration_source_map?;
    let declaration_line_starts = compute_line_starts(declaration_source);
    let declaration_index = Utf16Index::new(declaration_source, &declaration_line_starts);
    let (generated_line, generated_col) =
        declaration_index.byte_to_line_utf16_col(declaration_byte);
    let token = source_map.lookup_token(generated_line as u32, generated_col as u32)?;
    let original_line_starts = compute_line_starts(original_source);
    let original_index = Utf16Index::new(original_source, &original_line_starts);
    Some(
        original_index
            .line_utf16_col_to_byte(token.get_src_line() as usize, token.get_src_col() as usize),
    )
}

fn push_copied_span<'a>(
    mapped: &mut MappedText<'a>,
    input: &MappedText<'a>,
    span: Span,
) -> Result<(), RuntimeComponentError> {
    mapped
        .append_slice_from(input, span)
        .map_err(RuntimeComponentError::from)
}

fn collect_jsx_attributes(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let mut rendered = input.empty_like();
    let mut cursor = node.walk();
    for child in node.children_by_field_name("attribute", &mut cursor) {
        append_rendered(
            &mut rendered,
            convert_jsx_attribute(source, input, child, base_offset)?,
        );
    }
    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn convert_jsx_attribute(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "jsx_expression" => convert_jsx_spread_attribute(source, input, node, base_offset),
        "jsx_attribute" => convert_jsx_named_attribute(source, input, node, base_offset),
        other => Err(RuntimeComponentError::UnsupportedJsxAttributeNodeKind {
            kind: other.to_string(),
        }),
    }
}

fn convert_jsx_spread_attribute(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let span = translated_span(node, base_offset)?;
    let raw_inner = &source[span.start + 1..span.end - 1];
    let spread_offset = raw_inner
        .find("...")
        .ok_or(RuntimeComponentError::ExpectedSpreadElementInJsxSpreadAttribute)?;
    let after_spread = &raw_inner[spread_offset + 3..];

    let mut rendered = input.empty_like();

    if let Some((prefix, object_text)) = split_prefixed_object_expression(after_spread) {
        rendered.push_unmapped(" {...");
        let after_spread_start = span.start + 1 + spread_offset + 3;
        let prefix_trimmed = prefix.trim_start();
        if !prefix_trimmed.is_empty() {
            let prefix_start = after_spread_start + (prefix.len() - prefix_trimmed.len());
            push_copied_span(
                &mut rendered,
                input,
                Span::new(prefix_start, prefix_start + prefix_trimmed.len()),
            )?;
        }

        let object_start =
            object_text.as_ptr() as usize - raw_inner.as_ptr() as usize + span.start + 1;
        append_rendered(
            &mut rendered,
            lower_object_expression_span(
                source,
                input,
                Span::new(object_start, object_start + object_text.len()),
                false,
                0,
            )?,
        );
        rendered.push_unmapped("}");
        return rendered
            .into_rendered()
            .map_err(RuntimeComponentError::from);
    }

    rendered.push_unmapped(" ");
    push_copied_span(&mut rendered, input, span)?;
    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn convert_jsx_named_attribute(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let name_node =
        jsx_attribute_name_node(node).ok_or(RuntimeComponentError::MissingJsxAttributeName)?;
    let value_node = jsx_attribute_value_node(node);
    let name = source_slice(source, name_node, base_offset)?;

    let mut rendered = input.empty_like();
    rendered.push_unmapped(" ");
    push_copied_span(
        &mut rendered,
        input,
        translated_span(name_node, base_offset)?,
    )?;
    rendered.push_unmapped("={");

    match value_node {
        None => rendered.push_unmapped("true"),
        Some(value) if value.kind() == "string" => {
            push_copied_span(&mut rendered, input, translated_span(value, base_offset)?)?;
        }
        Some(value) if value.kind() == "jsx_expression" => {
            let inner = first_named_child(value);
            match inner {
                Some(expression) if name == "components" => {
                    append_rendered(
                        &mut rendered,
                        convert_components_expression(source, input, expression, base_offset, 0)?,
                    );
                }
                Some(expression) => {
                    push_copied_span(
                        &mut rendered,
                        input,
                        translated_span(expression, base_offset)?,
                    )?;
                }
                None => {}
            }
        }
        Some(value) if matches!(value.kind(), "jsx_element" | "jsx_self_closing_element") => {
            append_rendered(
                &mut rendered,
                convert_jsx_element_descriptor(source, input, value, base_offset, 0)?,
            );
        }
        Some(other) => {
            return Err(RuntimeComponentError::UnsupportedJsxAttributeValueKind {
                kind: other.kind().to_string(),
            });
        }
    }

    rendered.push_unmapped("}");
    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn convert_expression_for_runtime_trans(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "object" => {
            convert_object_expression(source, input, node, base_offset, false, indent_level)
        }
        _ => copy_node(source, input, node, base_offset),
    }
}

fn lower_object_expression_span(
    source: &str,
    input: &MappedText<'_>,
    span: Span,
    components_mode: bool,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let text = &source[span.start..span.end];
    let wrapper_prefix = "const __expr = (";
    let wrapped = format!("{wrapper_prefix}{text});");
    let tree = parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator")
        .ok_or(RuntimeComponentError::MissingVariableDeclaratorWhileLoweringObjectExpression)?;
    let value = declarator
        .child_by_field_name("value")
        .ok_or(RuntimeComponentError::MissingObjectExpressionInitializer)?;
    let object = if value.kind() == "parenthesized_expression" {
        first_named_child(value).unwrap_or(value)
    } else {
        value
    };
    if object.kind() != "object" {
        return copy_span(input, span);
    }

    convert_object_expression(
        source,
        input,
        object,
        span.start as isize - wrapper_prefix.len() as isize,
        components_mode,
        indent_level,
    )
}

fn convert_components_expression(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    if node.kind() != "object" {
        return Err(RuntimeComponentError::ExpectedObjectExpressionForRuntimeTransComponents);
    }

    convert_object_expression(source, input, node, base_offset, true, indent_level)
}

fn convert_object_expression(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    components_mode: bool,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = input.empty_like();
    let mut cursor = node.walk();
    let mut wrote_entry = false;

    rendered.push_unmapped("{");

    for child in node.named_children(&mut cursor) {
        if wrote_entry {
            rendered.push_unmapped(",\n");
        } else {
            rendered.push_unmapped("\n");
            wrote_entry = true;
        }
        rendered.push_unmapped(&child_indent);

        match child.kind() {
            "pair" => {
                let key = child
                    .child_by_field_name("key")
                    .ok_or(RuntimeComponentError::MissingObjectPairKey)?;
                let value = child
                    .child_by_field_name("value")
                    .ok_or(RuntimeComponentError::MissingObjectPairValue)?;
                let key_name = key_name(source, key, base_offset);
                push_copied_span(&mut rendered, input, translated_span(key, base_offset)?)?;
                rendered.push_unmapped(": ");
                append_rendered(
                    &mut rendered,
                    if components_mode {
                        convert_rich_text_component_value(
                            source,
                            input,
                            value,
                            base_offset,
                            indent_level + 1,
                        )?
                    } else if key_name.as_deref() == Some("components") {
                        convert_components_expression(
                            source,
                            input,
                            value,
                            base_offset,
                            indent_level + 1,
                        )?
                    } else {
                        convert_expression_for_runtime_trans(
                            source,
                            input,
                            value,
                            base_offset,
                            indent_level + 1,
                        )?
                    },
                );
            }
            "spread_element" => {
                let argument = first_named_child(child)
                    .ok_or(RuntimeComponentError::MissingSpreadArgumentInObjectExpression)?;
                rendered.push_unmapped("...");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        source,
                        input,
                        argument,
                        base_offset,
                        indent_level + 1,
                    )?,
                );
            }
            "shorthand_property_identifier" => {
                push_copied_span(&mut rendered, input, translated_span(child, base_offset)?)?;
            }
            other => {
                return Err(RuntimeComponentError::UnsupportedObjectChildKind {
                    kind: other.to_string(),
                });
            }
        }
    }

    if !wrote_entry {
        rendered.push_unmapped("}");
    } else {
        rendered.push_unmapped("\n");
        rendered.push_unmapped(&indent);
        rendered.push_unmapped("}");
    }

    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn convert_rich_text_component_value(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "jsx_element" | "jsx_self_closing_element" => {
            convert_jsx_element_descriptor(source, input, node, base_offset, indent_level)
        }
        _ => copy_node(source, input, node, base_offset),
    }
}

fn convert_jsx_element_descriptor(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or(RuntimeComponentError::ExpectedJsxElementDescriptor)?;

    let name_node = opening
        .child_by_field_name("name")
        .ok_or(RuntimeComponentError::MissingJsxNameInComponentDescriptor)?;
    let props =
        convert_jsx_attributes_to_object(source, input, opening, base_offset, indent_level + 1)?;
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = input.empty_like();

    rendered.push_unmapped("{\n");
    rendered.push_unmapped(&child_indent);
    if is_intrinsic_jsx_name(source, name_node, base_offset)? {
        rendered.push_unmapped("kind: \"element\",\n");
        rendered.push_unmapped(&child_indent);
        rendered.push_unmapped("tag: \"");
        push_copied_span(
            &mut rendered,
            input,
            translated_span(name_node, base_offset)?,
        )?;
        rendered.push_unmapped("\",\n");
    } else {
        rendered.push_unmapped("kind: \"component\",\n");
        rendered.push_unmapped(&child_indent);
        rendered.push_unmapped("component: ");
        push_copied_span(
            &mut rendered,
            input,
            translated_span(name_node, base_offset)?,
        )?;
        rendered.push_unmapped(",\n");
    }
    rendered.push_unmapped(&child_indent);
    rendered.push_unmapped("props: ");
    append_rendered(&mut rendered, props);
    rendered.push_unmapped("\n");
    rendered.push_unmapped(&indent);
    rendered.push_unmapped("}");
    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn convert_jsx_attributes_to_object(
    source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = input.empty_like();
    let mut cursor = node.walk();
    let mut wrote_entry = false;

    rendered.push_unmapped("{");

    for child in node.children_by_field_name("attribute", &mut cursor) {
        if wrote_entry {
            rendered.push_unmapped(",\n");
        } else {
            rendered.push_unmapped("\n");
            wrote_entry = true;
        }
        rendered.push_unmapped(&child_indent);

        match child.kind() {
            "jsx_expression" => {
                let spread = first_named_child(child)
                    .ok_or(RuntimeComponentError::MissingSpreadChildInJsxProps)?;
                let argument = first_named_child(spread)
                    .ok_or(RuntimeComponentError::MissingSpreadArgumentInJsxProps)?;
                rendered.push_unmapped("...");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        source,
                        input,
                        argument,
                        base_offset,
                        indent_level + 1,
                    )?,
                );
            }
            "jsx_attribute" => {
                let key = jsx_attribute_name_node(child)
                    .ok_or(RuntimeComponentError::MissingJsxPropName)?;
                push_copied_span(&mut rendered, input, translated_span(key, base_offset)?)?;
                rendered.push_unmapped(": ");
                match jsx_attribute_value_node(child) {
                    None => rendered.push_unmapped("true"),
                    Some(value) if value.kind() == "string" => {
                        push_copied_span(
                            &mut rendered,
                            input,
                            translated_span(value, base_offset)?,
                        )?;
                    }
                    Some(value) if value.kind() == "jsx_expression" => {
                        let expression = first_named_child(value)
                            .ok_or(RuntimeComponentError::MissingJsxExpressionValue)?;
                        append_rendered(
                            &mut rendered,
                            convert_expression_for_runtime_trans(
                                source,
                                input,
                                expression,
                                base_offset,
                                indent_level + 1,
                            )?,
                        );
                    }
                    Some(value) => {
                        push_copied_span(
                            &mut rendered,
                            input,
                            translated_span(value, base_offset)?,
                        )?;
                    }
                }
            }
            other => {
                return Err(RuntimeComponentError::UnsupportedJsxPropKind {
                    kind: other.to_string(),
                });
            }
        }
    }

    if !wrote_entry {
        rendered.push_unmapped("}");
    } else {
        rendered.push_unmapped("\n");
        rendered.push_unmapped(&indent);
        rendered.push_unmapped("}");
    }

    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn append_rendered(mapped: &mut MappedText<'_>, rendered: RenderedMappedText) {
    if let Some(map) = rendered.source_map {
        mapped.push_pre_mapped(rendered.code, map);
    } else {
        mapped.push_unmapped(rendered.code);
    }
}

fn copy_node(
    _source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    copy_span(input, translated_span(node, base_offset)?)
}

fn copy_span(
    input: &MappedText<'_>,
    span: Span,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let mut mapped = input.empty_like();
    push_copied_span(&mut mapped, input, span)?;
    mapped.into_rendered().map_err(RuntimeComponentError::from)
}

fn translated_span(node: Node<'_>, base_offset: isize) -> Result<Span, RuntimeComponentError> {
    let start = translated_offset(node.start_byte(), base_offset)?;
    let end = translated_offset(node.end_byte(), base_offset)?;
    Ok(Span::new(start, end))
}

fn translated_offset(offset: usize, base_offset: isize) -> Result<usize, RuntimeComponentError> {
    let translated = offset as isize + base_offset;
    if translated < 0 {
        return Err(RuntimeComponentError::TranslatedNodeOffsetNegative);
    }
    Ok(translated as usize)
}

fn source_slice<'a>(
    source: &'a str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<&'a str, RuntimeComponentError> {
    let span = translated_span(node, base_offset)?;
    Ok(&source[span.start..span.end])
}

fn jsx_attribute_name_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("name").or_else(|| {
        node.named_children(&mut node.walk())
            .find(|child| !matches!(child.kind(), "jsx_expression" | "string"))
    })
}

fn jsx_attribute_value_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("value").or_else(|| {
        let mut found_name = false;
        node.named_children(&mut node.walk()).find(|_| {
            if !found_name {
                found_name = true;
                false
            } else {
                true
            }
        })
    })
}

fn split_prefixed_object_expression(input: &str) -> Option<(&str, &str)> {
    let object_start = input.find('{')?;
    let object_text = &input[object_start..];
    Some((&input[..object_start], object_text))
}

fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    node.named_children(&mut node.walk()).next()
}

fn find_first_named_descendant<'a>(node: Node<'a>, kind: &str) -> Option<Node<'a>> {
    if node.kind() == kind {
        return Some(node);
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if let Some(found) = find_first_named_descendant(child, kind) {
            return Some(found);
        }
    }
    None
}

fn is_intrinsic_jsx_name(
    source: &str,
    name: Node<'_>,
    base_offset: isize,
) -> Result<bool, RuntimeComponentError> {
    Ok(source_slice(source, name, base_offset)?
        .chars()
        .next()
        .map(|first| first.is_ascii_lowercase())
        .unwrap_or(false))
}

fn key_name(source: &str, key: Node<'_>, base_offset: isize) -> Option<String> {
    match key.kind() {
        "property_identifier" | "identifier" => source_slice(source, key, base_offset)
            .ok()
            .map(ToString::to_string),
        "string" => {
            let span = translated_span(key, base_offset).ok()?;
            Some(source[span.start + 1..span.end.saturating_sub(1)].to_string())
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::lower_runtime_component_markup;
    use crate::common::RenderedMappedText;

    #[test]
    fn preserves_non_object_spread_without_duplicate_prefix() {
        let source = "<Trans {...foo()} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(lowered.code, "<L4sRuntimeTrans {...foo()} />");
    }

    #[test]
    fn lowers_object_spread_through_prefixed_object_path() {
        let source = "<Trans {...{}} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(lowered.code, "<L4sRuntimeTrans {...{}} />");
    }
}
