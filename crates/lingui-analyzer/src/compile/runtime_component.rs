use tree_sitter::Node;

use crate::common::{MappedText, RenderedMappedText, Span, build_copy_map, build_span_anchor_map};
use crate::framework::parse::{ParseError, parse_tsx};

#[derive(thiserror::Error, Debug)]
pub enum RuntimeComponentError {
    #[error("failed to lower runtime component: {0}")]
    LoweringFailed(String),
    #[error(transparent)]
    Parse(#[from] ParseError),
}

pub(crate) fn lower_runtime_component_markup(
    declaration_code: &str,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let wrapper_prefix = "const __lf = ";
    let wrapped = format!("{wrapper_prefix}{declaration_code};");
    let tree = parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "missing variable declarator for transformed component".to_string(),
        )
    })?;
    let value = declarator.child_by_field_name("value").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "missing initializer for transformed component".to_string(),
        )
    })?;

    convert_runtime_trans_root(
        declaration_code,
        value,
        -(wrapper_prefix.len() as isize),
        runtime_component_name,
    )
}

fn convert_runtime_trans_root(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "expected JSX element initializer for transformed component".to_string(),
        )
    })?;

    let mut mapped = MappedText::new("__runtime_component", source);
    let root_span = translated_span(node, base_offset)?;
    push_anchor_mapped(&mut mapped, source, "<", root_span.start);
    push_anchor_mapped(&mut mapped, source, runtime_component_name, root_span.start);
    append_rendered(
        &mut mapped,
        collect_jsx_attributes(source, opening, base_offset)?,
    );
    push_anchor_mapped(&mut mapped, source, " />", root_span.end);
    mapped.into_rendered().map_err(as_lowering_failure)
}

fn push_anchor_mapped(mapped: &mut MappedText<'_>, source: &str, text: &str, original_byte: usize) {
    let Some(map) = build_span_anchor_map(
        "__runtime_component",
        source,
        text,
        original_byte,
        original_byte,
    ) else {
        return;
    };
    mapped.push_pre_mapped(text, map);
}

fn push_copied_span(mapped: &mut MappedText<'_>, source: &str, span: Span) {
    let text = &source[span.start..span.end];
    if let Some(map) = build_copy_map("__runtime_component", source, span, &[]) {
        mapped.push_pre_mapped(text, map);
    } else {
        mapped.push_unmapped(text);
    }
}

fn collect_jsx_attributes(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let mut rendered = MappedText::new("__runtime_component", source);
    let mut cursor = node.walk();
    for child in node.children_by_field_name("attribute", &mut cursor) {
        append_rendered(
            &mut rendered,
            convert_jsx_attribute(source, child, base_offset)?,
        );
    }
    rendered.into_rendered().map_err(as_lowering_failure)
}

fn convert_jsx_attribute(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "jsx_expression" => convert_jsx_spread_attribute(source, node, base_offset),
        "jsx_attribute" => convert_jsx_named_attribute(source, node, base_offset),
        other => Err(RuntimeComponentError::LoweringFailed(format!(
            "unsupported JSX attribute node kind: {other}"
        ))),
    }
}

fn convert_jsx_spread_attribute(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let span = translated_span(node, base_offset)?;
    let raw_inner = &source[span.start + 1..span.end - 1];
    let spread_offset = raw_inner.find("...").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "expected spread element inside JSX spread attribute".to_string(),
        )
    })?;
    let after_spread = &raw_inner[spread_offset + 3..];

    let mut rendered = MappedText::new("__runtime_component", source);
    rendered.push_unmapped(" {...");

    if let Some((prefix, object_text)) = split_prefixed_object_expression(after_spread) {
        let after_spread_start = span.start + 1 + spread_offset + 3;
        let prefix_trimmed = prefix.trim_start();
        if !prefix_trimmed.is_empty() {
            let prefix_start = after_spread_start + (prefix.len() - prefix_trimmed.len());
            push_copied_span(
                &mut rendered,
                source,
                Span::new(prefix_start, prefix_start + prefix_trimmed.len()),
            );
        }

        let object_start =
            object_text.as_ptr() as usize - raw_inner.as_ptr() as usize + span.start + 1;
        append_rendered(
            &mut rendered,
            lower_object_expression_span(
                source,
                Span::new(object_start, object_start + object_text.len()),
                false,
                0,
            )?,
        );
        rendered.push_unmapped("}");
        return rendered.into_rendered().map_err(as_lowering_failure);
    }

    push_copied_span(&mut rendered, source, span);
    rendered.into_rendered().map_err(as_lowering_failure)
}

fn convert_jsx_named_attribute(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let name_node = jsx_attribute_name_node(node).ok_or_else(|| {
        RuntimeComponentError::LoweringFailed("missing JSX attribute name".to_string())
    })?;
    let value_node = jsx_attribute_value_node(node);
    let name = source_slice(source, name_node, base_offset)?;

    let mut rendered = MappedText::new("__runtime_component", source);
    rendered.push_unmapped(" ");
    push_copied_span(
        &mut rendered,
        source,
        translated_span(name_node, base_offset)?,
    );
    rendered.push_unmapped("={");

    match value_node {
        None => rendered.push_unmapped("true"),
        Some(value) if value.kind() == "string" => {
            push_copied_span(&mut rendered, source, translated_span(value, base_offset)?);
        }
        Some(value) if value.kind() == "jsx_expression" => {
            let inner = first_named_child(value);
            match inner {
                Some(expression) if name == "components" => {
                    append_rendered(
                        &mut rendered,
                        convert_components_expression(source, expression, base_offset, 0)?,
                    );
                }
                Some(expression) => {
                    push_copied_span(
                        &mut rendered,
                        source,
                        translated_span(expression, base_offset)?,
                    );
                }
                None => {}
            }
        }
        Some(value) if matches!(value.kind(), "jsx_element" | "jsx_self_closing_element") => {
            append_rendered(
                &mut rendered,
                convert_jsx_element_descriptor(source, value, base_offset, 0)?,
            );
        }
        Some(other) => {
            return Err(RuntimeComponentError::LoweringFailed(format!(
                "unsupported JSX attribute value kind: {}",
                other.kind()
            )));
        }
    }

    rendered.push_unmapped("}");
    rendered.into_rendered().map_err(as_lowering_failure)
}

fn convert_expression_for_runtime_trans(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "object" => convert_object_expression(source, node, base_offset, false, indent_level),
        _ => copy_node(source, node, base_offset),
    }
}

fn lower_object_expression_span(
    source: &str,
    span: Span,
    components_mode: bool,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let text = &source[span.start..span.end];
    let wrapper_prefix = "const __expr = (";
    let wrapped = format!("{wrapper_prefix}{text});");
    let tree = parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "missing variable declarator while lowering object expression".to_string(),
        )
    })?;
    let value = declarator.child_by_field_name("value").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed("missing object expression initializer".to_string())
    })?;
    let object = if value.kind() == "parenthesized_expression" {
        first_named_child(value).unwrap_or(value)
    } else {
        value
    };
    if object.kind() != "object" {
        return copy_span(source, span);
    }

    convert_object_expression(
        source,
        object,
        span.start as isize - wrapper_prefix.len() as isize,
        components_mode,
        indent_level,
    )
}

fn convert_components_expression(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    if node.kind() != "object" {
        return Err(RuntimeComponentError::LoweringFailed(
            "Runtime Trans components must lower from an object expression".to_string(),
        ));
    }

    convert_object_expression(source, node, base_offset, true, indent_level)
}

fn convert_object_expression(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    components_mode: bool,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = MappedText::new("__runtime_component", source);
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
                let key = child.child_by_field_name("key").ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed("missing object pair key".to_string())
                })?;
                let value = child.child_by_field_name("value").ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed("missing object pair value".to_string())
                })?;
                let key_name = key_name(source, key, base_offset);
                push_copied_span(&mut rendered, source, translated_span(key, base_offset)?);
                rendered.push_unmapped(": ");
                append_rendered(
                    &mut rendered,
                    if components_mode {
                        convert_rich_text_component_value(
                            source,
                            value,
                            base_offset,
                            indent_level + 1,
                        )?
                    } else if key_name.as_deref() == Some("components") {
                        convert_components_expression(source, value, base_offset, indent_level + 1)?
                    } else {
                        convert_expression_for_runtime_trans(
                            source,
                            value,
                            base_offset,
                            indent_level + 1,
                        )?
                    },
                );
            }
            "spread_element" => {
                let argument = first_named_child(child).ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed(
                        "missing spread argument in object expression".to_string(),
                    )
                })?;
                rendered.push_unmapped("...");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        source,
                        argument,
                        base_offset,
                        indent_level + 1,
                    )?,
                );
            }
            "shorthand_property_identifier" => {
                push_copied_span(&mut rendered, source, translated_span(child, base_offset)?);
            }
            other => {
                return Err(RuntimeComponentError::LoweringFailed(format!(
                    "unsupported object child kind in runtime component lowering: {other}"
                )));
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

    rendered.into_rendered().map_err(as_lowering_failure)
}

fn convert_rich_text_component_value(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "jsx_element" | "jsx_self_closing_element" => {
            convert_jsx_element_descriptor(source, node, base_offset, indent_level)
        }
        _ => copy_node(source, node, base_offset),
    }
}

fn convert_jsx_element_descriptor(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or_else(|| {
        RuntimeComponentError::LoweringFailed("expected JSX element descriptor".to_string())
    })?;

    let name_node = opening.child_by_field_name("name").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "missing JSX name in component descriptor".to_string(),
        )
    })?;
    let props = convert_jsx_attributes_to_object(source, opening, base_offset, indent_level + 1)?;
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = MappedText::new("__runtime_component", source);

    rendered.push_unmapped("{\n");
    rendered.push_unmapped(&child_indent);
    if is_intrinsic_jsx_name(source, name_node, base_offset)? {
        rendered.push_unmapped("kind: \"element\",\n");
        rendered.push_unmapped(&child_indent);
        rendered.push_unmapped("tag: \"");
        push_copied_span(
            &mut rendered,
            source,
            translated_span(name_node, base_offset)?,
        );
        rendered.push_unmapped("\",\n");
    } else {
        rendered.push_unmapped("kind: \"component\",\n");
        rendered.push_unmapped(&child_indent);
        rendered.push_unmapped("component: ");
        push_copied_span(
            &mut rendered,
            source,
            translated_span(name_node, base_offset)?,
        );
        rendered.push_unmapped(",\n");
    }
    rendered.push_unmapped(&child_indent);
    rendered.push_unmapped("props: ");
    append_rendered(&mut rendered, props);
    rendered.push_unmapped("\n");
    rendered.push_unmapped(&indent);
    rendered.push_unmapped("}");
    rendered.into_rendered().map_err(as_lowering_failure)
}

fn convert_jsx_attributes_to_object(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = MappedText::new("__runtime_component", source);
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
                let spread = first_named_child(child).ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed(
                        "missing spread child in JSX props".to_string(),
                    )
                })?;
                let argument = first_named_child(spread).ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed(
                        "missing spread argument in JSX props".to_string(),
                    )
                })?;
                rendered.push_unmapped("...");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        source,
                        argument,
                        base_offset,
                        indent_level + 1,
                    )?,
                );
            }
            "jsx_attribute" => {
                let key = jsx_attribute_name_node(child).ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed("missing JSX prop name".to_string())
                })?;
                push_copied_span(&mut rendered, source, translated_span(key, base_offset)?);
                rendered.push_unmapped(": ");
                match jsx_attribute_value_node(child) {
                    None => rendered.push_unmapped("true"),
                    Some(value) if value.kind() == "string" => {
                        push_copied_span(
                            &mut rendered,
                            source,
                            translated_span(value, base_offset)?,
                        );
                    }
                    Some(value) if value.kind() == "jsx_expression" => {
                        let expression = first_named_child(value).ok_or_else(|| {
                            RuntimeComponentError::LoweringFailed(
                                "missing JSX expression value".to_string(),
                            )
                        })?;
                        append_rendered(
                            &mut rendered,
                            convert_expression_for_runtime_trans(
                                source,
                                expression,
                                base_offset,
                                indent_level + 1,
                            )?,
                        );
                    }
                    Some(value) => {
                        push_copied_span(
                            &mut rendered,
                            source,
                            translated_span(value, base_offset)?,
                        );
                    }
                }
            }
            other => {
                return Err(RuntimeComponentError::LoweringFailed(format!(
                    "unsupported JSX prop kind: {other}"
                )));
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

    rendered.into_rendered().map_err(as_lowering_failure)
}

fn append_rendered(mapped: &mut MappedText<'_>, rendered: RenderedMappedText) {
    if let Some(map) = rendered.source_map {
        mapped.push_pre_mapped(rendered.code, map);
    } else {
        mapped.push_unmapped(rendered.code);
    }
}

fn copy_node(
    source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    copy_span(source, translated_span(node, base_offset)?)
}

fn copy_span(source: &str, span: Span) -> Result<RenderedMappedText, RuntimeComponentError> {
    let mut mapped = MappedText::new("__runtime_component", source);
    push_copied_span(&mut mapped, source, span);
    mapped.into_rendered().map_err(as_lowering_failure)
}

fn translated_span(node: Node<'_>, base_offset: isize) -> Result<Span, RuntimeComponentError> {
    let start = translated_offset(node.start_byte(), base_offset)?;
    let end = translated_offset(node.end_byte(), base_offset)?;
    Ok(Span::new(start, end))
}

fn translated_offset(offset: usize, base_offset: isize) -> Result<usize, RuntimeComponentError> {
    let translated = offset as isize + base_offset;
    if translated < 0 {
        return Err(RuntimeComponentError::LoweringFailed(
            "translated node offset became negative".to_string(),
        ));
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

fn as_lowering_failure(error: crate::common::MappedTextError) -> RuntimeComponentError {
    RuntimeComponentError::LoweringFailed(error.to_string())
}

#[cfg(test)]
mod tests {
    use indoc::indoc;

    use super::lower_runtime_component_markup;

    #[test]
    fn indents_nested_components_entries_under_components_field() {
        let lowered = lower_runtime_component_markup(
            indoc! {r#"
                <LocalRuntimeTrans {...{
                  id: "demo.docs",
                  message: "Read the <0>docs</0>.",
                  components: {
                    0: <a href="/docs" />
                  }
                }} />
            "#},
            "RuntimeTransStable",
        )
        .expect("component lowers");

        assert!(
            lowered.code.contains(indoc! {r#"
                components: {
                    0: {
            "#}),
            "{}",
            lowered.code
        );
        assert!(lowered.source_map.is_some());
    }
}
