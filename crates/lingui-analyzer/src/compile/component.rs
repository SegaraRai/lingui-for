use tree_sitter::Node;

use crate::{AnalyzerError, framework::parse};

pub fn lower_svelte_runtime_component_markup(
    declaration_code: &str,
    runtime_component_name: &str,
) -> Result<String, AnalyzerError> {
    let wrapped = format!("const __lf = {declaration_code};");
    let tree = parse::parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing variable declarator for transformed component".to_string(),
        )
    })?;
    let value = declarator.child_by_field_name("value").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing initializer for transformed component".to_string(),
        )
    })?;

    convert_runtime_trans_root(&wrapped, value, runtime_component_name)
}

fn convert_runtime_trans_root(
    source: &str,
    node: Node<'_>,
    runtime_component_name: &str,
) -> Result<String, AnalyzerError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "expected JSX element initializer for transformed component".to_string(),
        )
    })?;

    let attributes = collect_jsx_attributes(source, opening)?;
    Ok(format!("<{runtime_component_name}{attributes} />"))
}

fn collect_jsx_attributes(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    let mut rendered = String::new();
    let mut cursor = node.walk();
    for child in node.children_by_field_name("attribute", &mut cursor) {
        rendered.push_str(&convert_jsx_attribute(source, child)?);
    }
    Ok(rendered)
}

fn convert_jsx_attribute(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    match node.kind() {
        "jsx_expression" => convert_jsx_spread_attribute(source, node),
        "jsx_attribute" => convert_jsx_named_attribute(source, node),
        other => Err(AnalyzerError::ComponentLoweringFailed(format!(
            "unsupported JSX attribute node kind: {other}"
        ))),
    }
}

fn convert_jsx_spread_attribute(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    let raw_inner = &source[node.start_byte() + 1..node.end_byte() - 1];
    let spread_offset = raw_inner.find("...").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
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

fn convert_jsx_named_attribute(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    let mut cursor = node.walk();
    let mut children = node.named_children(&mut cursor);
    let name_node = children.next().ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed("missing JSX attribute name".to_string())
    })?;
    let value_node = children.next();
    let name = source_slice(source, name_node);

    let value = match value_node {
        None => "true".to_string(),
        Some(node) if node.kind() == "string" => source_slice(source, node).to_string(),
        Some(node) if node.kind() == "jsx_expression" => {
            let inner = first_named_child(node);
            match inner {
                Some(expression) if name == "components" => {
                    convert_components_expression(source, expression)?
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
            return Err(AnalyzerError::ComponentLoweringFailed(format!(
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
) -> Result<String, AnalyzerError> {
    match node.kind() {
        "object" => convert_object_expression(source, node, false, indent_level),
        _ => Ok(source_slice(source, node).to_string()),
    }
}

fn lower_object_expression_text(text: &str) -> Result<String, AnalyzerError> {
    let wrapped = format!("const __expr = ({text});");
    let tree = parse::parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing variable declarator while lowering object expression".to_string(),
        )
    })?;
    let value = declarator.child_by_field_name("value").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed("missing object expression initializer".to_string())
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

fn convert_components_expression(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    if node.kind() != "object" {
        return Err(AnalyzerError::ComponentLoweringFailed(
            "Runtime Trans components must lower from an object expression".to_string(),
        ));
    }

    convert_object_expression(source, node, true, 0)
}

fn convert_object_expression(
    source: &str,
    node: Node<'_>,
    components_mode: bool,
    indent_level: usize,
) -> Result<String, AnalyzerError> {
    let mut parts = Vec::new();
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut cursor = node.walk();

    for child in node.named_children(&mut cursor) {
        match child.kind() {
            "pair" => {
                let key = child.child_by_field_name("key").ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed("missing object pair key".to_string())
                })?;
                let value = child.child_by_field_name("value").ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed("missing object pair value".to_string())
                })?;
                let key_text = source_slice(source, key);
                let key_name = key_name(source, key);
                let rendered_value = if components_mode {
                    convert_rich_text_component_value(source, value, indent_level + 1)?
                } else if key_name.as_deref() == Some("components") {
                    convert_components_expression(source, value)?
                } else {
                    convert_expression_for_runtime_trans(source, value, indent_level + 1)?
                };
                parts.push(format!("{child_indent}{key_text}: {rendered_value}"));
            }
            "spread_element" => {
                let argument = first_named_child(child).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
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
                return Err(AnalyzerError::ComponentLoweringFailed(format!(
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
) -> Result<String, AnalyzerError> {
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
) -> Result<String, AnalyzerError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed("expected JSX element descriptor".to_string())
    })?;

    let name_node = opening.child_by_field_name("name").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
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
) -> Result<String, AnalyzerError> {
    let mut parts = Vec::new();
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut cursor = node.walk();

    for child in node.children_by_field_name("attribute", &mut cursor) {
        match child.kind() {
            "jsx_expression" => {
                let spread = first_named_child(child).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
                        "missing spread child in JSX props".to_string(),
                    )
                })?;
                let argument = first_named_child(spread).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
                        "missing spread argument in JSX props".to_string(),
                    )
                })?;
                parts.push(format!(
                    "{child_indent}...{}",
                    convert_expression_for_runtime_trans(source, argument, indent_level + 1)?
                ));
            }
            "jsx_attribute" => {
                let mut attr_cursor = child.walk();
                let mut children = child.named_children(&mut attr_cursor);
                let name_node = children.next().ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
                        "missing attribute name in JSX props".to_string(),
                    )
                })?;
                let key = source_slice(source, name_node);
                let value = match children.next() {
                    None => "true".to_string(),
                    Some(node) if node.kind() == "string" => source_slice(source, node).to_string(),
                    Some(node) if node.kind() == "jsx_expression" => {
                        match first_named_child(node) {
                            Some(inner) => convert_expression_for_runtime_trans(
                                source,
                                inner,
                                indent_level + 1,
                            )?,
                            None => String::new(),
                        }
                    }
                    Some(node)
                        if matches!(node.kind(), "jsx_element" | "jsx_self_closing_element") =>
                    {
                        convert_jsx_element_descriptor(source, node, indent_level + 1)?
                    }
                    Some(other) => {
                        return Err(AnalyzerError::ComponentLoweringFailed(format!(
                            "unsupported JSX props value kind: {}",
                            other.kind()
                        )));
                    }
                };
                parts.push(format!("{child_indent}{key}: {value}"));
            }
            other => {
                return Err(AnalyzerError::ComponentLoweringFailed(format!(
                    "unsupported JSX props child kind: {other}"
                )));
            }
        }
    }

    if parts.is_empty() {
        return Ok("{}".to_string());
    }

    Ok(format!("{{\n{}\n{indent}}}", parts.join(",\n")))
}

fn is_intrinsic_jsx_name(source: &str, node: Node<'_>) -> bool {
    if node.kind() != "identifier" {
        return false;
    }

    source_slice(source, node)
        .chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_lowercase())
}

fn key_name(source: &str, node: Node<'_>) -> Option<String> {
    match node.kind() {
        "property_identifier" | "identifier" => Some(source_slice(source, node).to_string()),
        "string" => {
            let raw = source_slice(source, node);
            Some(raw.trim_matches(&['"', '\''][..]).to_string())
        }
        "number" => Some(source_slice(source, node).to_string()),
        _ => None,
    }
}

fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).next()
}

fn split_prefixed_object_expression(text: &str) -> Option<(&str, &str)> {
    let brace_index = text.find('{')?;
    Some(text.split_at(brace_index))
}

fn find_first_named_descendant<'tree>(node: Node<'tree>, kind: &str) -> Option<Node<'tree>> {
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

fn source_slice<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}

#[cfg(test)]
mod tests {
    use indoc::indoc;

    use super::lower_svelte_runtime_component_markup;

    #[test]
    fn lowers_runtime_trans_jsx_to_svelte_markup() {
        let lowered = lower_svelte_runtime_component_markup(
            indoc! {r#"
                <_Trans {.../*i18n*/{
                  id: "demo.docs",
                  message: "Read the <0>docs</0>.",
                  components: {
                    0: <a href="/docs">docs</a>,
                    1: <DocLink href="/guide" />
                  }
                }} />
            "#},
            "L4sRuntimeTrans",
        )
        .expect("component lowering should succeed");

        assert!(lowered.contains("<L4sRuntimeTrans"));
        assert!(lowered.contains("kind: \"element\""));
        assert!(lowered.contains("tag: \"a\""));
        assert!(lowered.contains("kind: \"component\""));
        assert!(lowered.contains("component: DocLink"));
    }
}
