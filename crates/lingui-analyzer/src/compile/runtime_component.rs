use tree_sitter::Node;

use crate::common::{
    IndexedSourceMap, IndexedText, MappedText, MappedTextError, RenderedMappedText, Span,
    build_span_anchor_map,
};
use crate::framework::parse::ParseError;

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
    UnsupportedJsxAttributeNodeKind { kind: &'static str },
    #[error("expected spread element inside JSX spread attribute")]
    ExpectedSpreadElementInJsxSpreadAttribute,
    #[error("missing JSX attribute name")]
    MissingJsxAttributeName,
    #[error("unsupported JSX attribute value kind: {kind}")]
    UnsupportedJsxAttributeValueKind { kind: &'static str },
    #[error("missing variable declarator while lowering object expression")]
    MissingVariableDeclaratorWhileLoweringObjectExpression,
    #[error("missing object expression initializer")]
    MissingObjectExpressionInitializer,
    #[error("Runtime Trans components must lower from an object expression")]
    ExpectedObjectExpressionForRuntimeTransComponents,
    #[error("missing object pair key")]
    MissingObjectPairKey,
    #[error("runtime component placeholder key contains unsupported characters: {key}")]
    InvalidRuntimePlaceholderKey { key: String },
    #[error("missing object pair value")]
    MissingObjectPairValue,
    #[error("missing spread argument in object expression")]
    MissingSpreadArgumentInObjectExpression,
    #[error("unsupported object child kind in runtime component lowering: {kind}")]
    UnsupportedObjectChildKind { kind: &'static str },
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
    UnsupportedJsxPropKind { kind: &'static str },
    #[error("translated node offset became negative")]
    TranslatedNodeOffsetNegative,
}

pub(super) fn push_anchor_mapped(
    mapped: &mut MappedText<'_>,
    declaration_source_map: Option<&IndexedSourceMap>,
    declaration_source: &IndexedText<'_>,
    original_source: &IndexedText<'_>,
    text: &str,
    declaration_byte: usize,
) {
    let map = project_declaration_byte_to_original_byte(
        declaration_source_map,
        declaration_source,
        original_source,
        declaration_byte,
    )
    .and_then(|original_byte| {
        build_span_anchor_map(
            mapped.source_name(),
            original_source,
            text,
            original_byte,
            original_byte,
        )
    });
    mapped.push(text, map);
}

fn project_declaration_byte_to_original_byte(
    declaration_source_map: Option<&IndexedSourceMap>,
    declaration_source: &IndexedText<'_>,
    original_source: &IndexedText<'_>,
    declaration_byte: usize,
) -> Option<usize> {
    let source_map = declaration_source_map?.source_map();
    let (generated_line, generated_col) =
        declaration_source.byte_to_line_utf16_col(declaration_byte)?;
    let token = source_map.lookup_token(generated_line as u32, generated_col as u32)?;
    let byte = original_source
        .line_utf16_col_to_byte(token.get_src_line() as usize, token.get_src_col() as usize)?;
    Some(byte)
}

pub(super) fn push_copied_span<'a>(
    mapped: &mut MappedText<'a>,
    input: &MappedText<'a>,
    span: Span,
) -> Result<(), RuntimeComponentError> {
    mapped
        .append_slice_from(input, span)
        .map_err(RuntimeComponentError::from)
}

pub(super) fn convert_jsx_named_attribute(
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
                kind: other.kind(),
            });
        }
    }

    rendered.push_unmapped("}");
    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

pub(super) fn convert_expression_for_runtime_trans(
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

pub(super) fn convert_components_expression(
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
                let argument = spread_argument_node(child)
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
                return Err(RuntimeComponentError::UnsupportedObjectChildKind { kind: other });
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
                let spread = spread_element_node(child)
                    .ok_or(RuntimeComponentError::MissingSpreadChildInJsxProps)?;
                let argument = spread_argument_node(spread)
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
                let key_text = source_slice(source, key, base_offset)?;
                rendered.push_unmapped(render_js_object_key(key_text));
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
                return Err(RuntimeComponentError::UnsupportedJsxPropKind { kind: other });
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

pub(super) fn append_rendered(mapped: &mut MappedText<'_>, rendered: RenderedMappedText) {
    mapped.push(rendered.code, rendered.indexed_source_map);
}

pub(super) fn copy_node(
    _source: &str,
    input: &MappedText<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    copy_span(input, translated_span(node, base_offset)?)
}

pub(super) fn copy_span(
    input: &MappedText<'_>,
    span: Span,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let mut mapped = input.empty_like();
    push_copied_span(&mut mapped, input, span)?;
    mapped.into_rendered().map_err(RuntimeComponentError::from)
}

pub(super) fn translated_span(
    node: Node<'_>,
    base_offset: isize,
) -> Result<Span, RuntimeComponentError> {
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

pub(super) fn source_slice<'a>(
    source: &'a str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<&'a str, RuntimeComponentError> {
    let span = translated_span(node, base_offset)?;
    Ok(&source[span.start..span.end])
}

pub(super) fn jsx_attribute_name_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("name").or_else(|| {
        node.named_children(&mut node.walk())
            .find(|child| !matches!(child.kind(), "jsx_expression" | "string"))
    })
}

pub(super) fn jsx_attribute_value_node(node: Node<'_>) -> Option<Node<'_>> {
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

pub(super) fn lowerable_object_expression_node(node: Node<'_>) -> Option<Node<'_>> {
    match node.kind() {
        "object" => Some(node),
        "parenthesized_expression" => {
            first_named_child(node).and_then(lowerable_object_expression_node)
        }
        _ => None,
    }
}

pub(super) fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    node.named_children(&mut node.walk()).next()
}

pub(super) fn spread_element_node(node: Node<'_>) -> Option<Node<'_>> {
    node.named_children(&mut node.walk())
        .find(|child| child.kind() == "spread_element")
}

pub(super) fn spread_argument_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("argument").or_else(|| {
        node.named_children(&mut node.walk())
            .find(|child| child.kind() != "comment")
    })
}

pub(super) fn find_first_named_descendant<'a>(node: Node<'a>, kind: &str) -> Option<Node<'a>> {
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

pub(super) fn find_node_by_span(node: Node<'_>, span: Span) -> Option<Node<'_>> {
    if node.start_byte() > span.start || node.end_byte() < span.end {
        return None;
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if let Some(found) = find_node_by_span(child, span) {
            return Some(found);
        }
    }

    if node.start_byte() == span.start && node.end_byte() == span.end {
        Some(node)
    } else {
        None
    }
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

pub(super) fn key_name(source: &str, key: Node<'_>, base_offset: isize) -> Option<String> {
    match key.kind() {
        "property_identifier" | "identifier" => source_slice(source, key, base_offset)
            .ok()
            .map(ToString::to_string),
        "number" => source_slice(source, key, base_offset)
            .ok()
            .map(ToString::to_string),
        "string" => {
            let span = translated_span(key, base_offset).ok()?;
            Some(source[span.start + 1..span.end.saturating_sub(1)].to_string())
        }
        _ => None,
    }
}

pub(super) fn validate_runtime_placeholder_key(
    key: String,
) -> Result<String, RuntimeComponentError> {
    if !key.is_empty()
        && key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        Ok(key)
    } else {
        Err(RuntimeComponentError::InvalidRuntimePlaceholderKey { key })
    }
}

fn render_js_object_key(key: &str) -> String {
    if key == "__proto__" {
        r#"["__proto__"]"#.to_string()
    } else if is_safe_unquoted_js_object_key(key) {
        key.to_string()
    } else {
        format!("{key:?}")
    }
}

fn is_safe_unquoted_js_object_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return false;
    }

    chars.all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '$')
}

#[cfg(test)]
mod tests {
    use super::render_js_object_key;

    #[test]
    fn quotes_unsafe_js_object_keys() {
        assert_eq!(render_js_object_key("data-foo"), "\"data-foo\"");
        assert_eq!(render_js_object_key("aria-label"), "\"aria-label\"");
        assert_eq!(render_js_object_key("0"), "\"0\"");
        assert_eq!(render_js_object_key("__proto__"), r#"["__proto__"]"#);
    }

    #[test]
    fn keeps_safe_js_object_keys_unquoted() {
        assert_eq!(render_js_object_key("title"), "title");
        assert_eq!(render_js_object_key("_private"), "_private");
        assert_eq!(render_js_object_key("$value"), "$value");
        assert_eq!(render_js_object_key("camelCase123"), "camelCase123");
    }
}
