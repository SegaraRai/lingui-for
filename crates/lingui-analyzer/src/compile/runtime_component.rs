use tree_sitter::Node;

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
) -> Result<String, RuntimeComponentError> {
    let wrapped = format!("const __lf = {declaration_code};");
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

    convert_runtime_trans_root(&wrapped, value, runtime_component_name)
}

fn convert_runtime_trans_root(
    source: &str,
    node: Node<'_>,
    runtime_component_name: &str,
) -> Result<String, RuntimeComponentError> {
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

    let attributes = collect_jsx_attributes(source, opening)?;
    Ok(format!("<{runtime_component_name}{attributes} />"))
}

fn collect_jsx_attributes(source: &str, node: Node<'_>) -> Result<String, RuntimeComponentError> {
    let mut rendered = String::new();
    let mut cursor = node.walk();
    for child in node.children_by_field_name("attribute", &mut cursor) {
        rendered.push_str(&convert_jsx_attribute(source, child)?);
    }
    Ok(rendered)
}

fn convert_jsx_attribute(source: &str, node: Node<'_>) -> Result<String, RuntimeComponentError> {
    match node.kind() {
        "jsx_expression" => convert_jsx_spread_attribute(source, node),
        "jsx_attribute" => convert_jsx_named_attribute(source, node),
        other => Err(RuntimeComponentError::LoweringFailed(format!(
            "unsupported JSX attribute node kind: {other}"
        ))),
    }
}

fn convert_jsx_spread_attribute(
    source: &str,
    node: Node<'_>,
) -> Result<String, RuntimeComponentError> {
    let raw_inner = &source[node.start_byte() + 1..node.end_byte() - 1];
    let spread_offset = raw_inner.find("...").ok_or_else(|| {
        RuntimeComponentError::LoweringFailed(
            "expected spread element inside JSX spread attribute".to_string(),
        )
    })?;
    let after_spread = &raw_inner[spread_offset + 3..];

    if let Some((prefix, object_text)) = split_prefixed_object_expression(after_spread) {
        let lowered_argument = lower_object_expression_text(object_text)?;
        return Ok(format!(
            " {{...{}{}}}",
            prefix.trim_start(),
            lowered_argument
        ));
    }

    Ok(format!(" {{{raw_inner}}}"))
}

fn convert_jsx_named_attribute(
    source: &str,
    node: Node<'_>,
) -> Result<String, RuntimeComponentError> {
    let name_node = jsx_attribute_name_node(node).ok_or_else(|| {
        RuntimeComponentError::LoweringFailed("missing JSX attribute name".to_string())
    })?;
    let value_node = jsx_attribute_value_node(node);
    let name = source_slice(source, name_node);

    let value = match value_node {
        None => "true".to_string(),
        Some(node) if node.kind() == "string" => source_slice(source, node).to_string(),
        Some(node) if node.kind() == "jsx_expression" => {
            let inner = first_named_child(node);
            match inner {
                Some(expression) if name == "components" => {
                    convert_components_expression(source, expression, 0)?
                }
                Some(expression) => {
                    let prefix = &source[node.start_byte() + 1..expression.start_byte()];
                    let suffix = &source[expression.end_byte()..node.end_byte() - 1];
                    format!("{prefix}{}{suffix}", source_slice(source, expression))
                }
                None => String::new(),
            }
        }
        Some(node) if matches!(node.kind(), "jsx_element" | "jsx_self_closing_element") => {
            convert_jsx_element_descriptor(source, node, 0)?
        }
        Some(other) => {
            return Err(RuntimeComponentError::LoweringFailed(format!(
                "unsupported JSX attribute value kind: {}",
                other.kind()
            )));
        }
    };

    Ok(format!(" {name}={{{value}}}"))
}

fn convert_expression_for_runtime_trans(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, RuntimeComponentError> {
    match node.kind() {
        "object" => convert_object_expression(source, node, false, indent_level),
        _ => Ok(source_slice(source, node).to_string()),
    }
}

fn lower_object_expression_text(text: &str) -> Result<String, RuntimeComponentError> {
    let wrapped = format!("const __expr = ({text});");
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
        return Ok(text.to_string());
    }

    convert_object_expression(&wrapped, object, false, 0)
}

fn convert_components_expression(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, RuntimeComponentError> {
    if node.kind() != "object" {
        return Err(RuntimeComponentError::LoweringFailed(
            "Runtime Trans components must lower from an object expression".to_string(),
        ));
    }

    convert_object_expression(source, node, true, indent_level)
}

fn convert_object_expression(
    source: &str,
    node: Node<'_>,
    components_mode: bool,
    indent_level: usize,
) -> Result<String, RuntimeComponentError> {
    let mut parts = Vec::new();
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut cursor = node.walk();

    for child in node.named_children(&mut cursor) {
        match child.kind() {
            "pair" => {
                let key = child.child_by_field_name("key").ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed("missing object pair key".to_string())
                })?;
                let value = child.child_by_field_name("value").ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed("missing object pair value".to_string())
                })?;
                let key_text = source_slice(source, key);
                let key_name = key_name(source, key);
                let rendered_value = if components_mode {
                    convert_rich_text_component_value(source, value, indent_level + 1)?
                } else if key_name.as_deref() == Some("components") {
                    convert_components_expression(source, value, indent_level + 1)?
                } else {
                    convert_expression_for_runtime_trans(source, value, indent_level + 1)?
                };
                parts.push(format!("{child_indent}{key_text}: {rendered_value}"));
            }
            "spread_element" => {
                let argument = first_named_child(child).ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed(
                        "missing spread argument in object expression".to_string(),
                    )
                })?;
                let rendered_argument =
                    convert_expression_for_runtime_trans(source, argument, indent_level + 1)?;
                parts.push(format!("{child_indent}...{rendered_argument}"));
            }
            "shorthand_property_identifier" => {
                parts.push(format!("{child_indent}{}", source_slice(source, child)));
            }
            other => {
                return Err(RuntimeComponentError::LoweringFailed(format!(
                    "unsupported object child kind in runtime component lowering: {other}"
                )));
            }
        }
    }

    if parts.is_empty() {
        return Ok("{}".to_string());
    }

    Ok(format!("{{\n{}\n{indent}}}", parts.join(",\n")))
}

fn convert_rich_text_component_value(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, RuntimeComponentError> {
    match node.kind() {
        "jsx_element" | "jsx_self_closing_element" => {
            convert_jsx_element_descriptor(source, node, indent_level)
        }
        _ => Ok(source_slice(source, node).to_string()),
    }
}

fn convert_jsx_element_descriptor(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, RuntimeComponentError> {
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
    let props = convert_jsx_attributes_to_object(source, opening, indent_level + 1)?;
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let kind_is_element = is_intrinsic_jsx_name(source, name_node);

    if kind_is_element {
        let tag = source_slice(source, name_node);
        return Ok(format!(
            "{{\n{child_indent}kind: \"element\",\n{child_indent}tag: \"{tag}\",\n{child_indent}props: {props}\n{indent}}}"
        ));
    }

    let component = source_slice(source, name_node);
    Ok(format!(
        "{{\n{child_indent}kind: \"component\",\n{child_indent}component: {component},\n{child_indent}props: {props}\n{indent}}}"
    ))
}

fn convert_jsx_attributes_to_object(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, RuntimeComponentError> {
    let mut parts = Vec::new();
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut cursor = node.walk();

    for child in node.children_by_field_name("attribute", &mut cursor) {
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
                let rendered =
                    convert_expression_for_runtime_trans(source, argument, indent_level + 1)?;
                parts.push(format!("{child_indent}...{rendered}"));
            }
            "jsx_attribute" => {
                let key = jsx_attribute_name_node(child).ok_or_else(|| {
                    RuntimeComponentError::LoweringFailed("missing JSX prop name".to_string())
                })?;
                let key_text = source_slice(source, key);
                let value = jsx_attribute_value_node(child);
                let rendered = match value {
                    None => "true".to_string(),
                    Some(value) if value.kind() == "string" => {
                        source_slice(source, value).to_string()
                    }
                    Some(value) if value.kind() == "jsx_expression" => {
                        let expression = first_named_child(value).ok_or_else(|| {
                            RuntimeComponentError::LoweringFailed(
                                "missing JSX expression value".to_string(),
                            )
                        })?;
                        convert_expression_for_runtime_trans(source, expression, indent_level + 1)?
                    }
                    Some(value) => source_slice(source, value).to_string(),
                };
                parts.push(format!("{child_indent}{key_text}: {rendered}"));
            }
            other => {
                return Err(RuntimeComponentError::LoweringFailed(format!(
                    "unsupported JSX prop kind: {other}"
                )));
            }
        }
    }

    if parts.is_empty() {
        return Ok("{}".to_string());
    }

    Ok(format!("{{\n{}\n{indent}}}", parts.join(",\n")))
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

fn is_intrinsic_jsx_name(source: &str, name: Node<'_>) -> bool {
    source_slice(source, name)
        .chars()
        .next()
        .map(|first| first.is_ascii_lowercase())
        .unwrap_or(false)
}

fn key_name(source: &str, key: Node<'_>) -> Option<String> {
    match key.kind() {
        "property_identifier" | "identifier" => Some(source_slice(source, key).to_string()),
        "string" => {
            Some(source[key.start_byte() + 1..key.end_byte().saturating_sub(1)].to_string())
        }
        _ => None,
    }
}

fn source_slice<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
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
            lowered.contains(indoc! {r#"
                components: {
                    0: {
            "#}),
            "{lowered}"
        );
    }
}
