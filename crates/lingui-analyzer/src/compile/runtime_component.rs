use tree_sitter::Node;

use crate::common::{
    IndexedSourceMap, IndexedText, MappedText, MappedTextError, RenderedMappedText, Span,
    build_span_anchor_map,
};
use crate::framework::parse::{ParseError, parse_svelte, parse_tsx};

use super::CompileTarget;

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
    #[error("missing original Svelte Trans node for runtime component lowering")]
    MissingOriginalSvelteTransNode,
    #[error("missing tag name while lowering Svelte snippet")]
    MissingTagNameWhileLoweringSvelteSnippet,
    #[error("mismatched Svelte runtime component placeholders: expected {expected}, found {found}")]
    MismatchedSvelteRuntimeComponentPlaceholderCount { expected: usize, found: usize },
}

pub(crate) fn lower_runtime_component_markup(
    source_name: &str,
    original_source: &str,
    declaration: &RenderedMappedText,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let declaration_source = IndexedText::new(&declaration.code);
    let original_source = IndexedText::new(original_source);
    let mapped_input = MappedText::from_rendered(
        source_name,
        original_source.as_str(),
        &declaration.code,
        declaration.indexed_source_map.as_ref(),
    );
    let wrapper_prefix = "const __lf = ";
    let wrapped = format!("{wrapper_prefix}{};", declaration.code);
    let tree = parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator")
        .ok_or(RuntimeComponentError::MissingVariableDeclaratorForTransformedComponent)?;
    let value = declarator
        .child_by_field_name("value")
        .ok_or(RuntimeComponentError::MissingInitializerForTransformedComponent)?;

    convert_runtime_trans_root(
        &original_source,
        declaration.indexed_source_map.as_ref(),
        &declaration_source,
        &mapped_input,
        value,
        -(wrapper_prefix.len() as isize),
        runtime_component_name,
    )
}

pub(crate) fn lower_runtime_component_markup_svelte(
    source_name: &str,
    original_source: &str,
    target: &CompileTarget,
    declaration: &RenderedMappedText,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let declaration_source = IndexedText::new(&declaration.code);
    let original_source = IndexedText::new(original_source);
    let mapped_input = MappedText::from_rendered(
        source_name,
        original_source.as_str(),
        &declaration.code,
        declaration.indexed_source_map.as_ref(),
    );
    let wrapper_prefix = "const __lf = ";
    let wrapped = format!("{wrapper_prefix}{};", declaration.code);
    let tree = parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator")
        .ok_or(RuntimeComponentError::MissingVariableDeclaratorForTransformedComponent)?;
    let value = declarator
        .child_by_field_name("value")
        .ok_or(RuntimeComponentError::MissingInitializerForTransformedComponent)?;

    convert_runtime_trans_root_svelte(
        &original_source,
        declaration.indexed_source_map.as_ref(),
        &declaration_source,
        &mapped_input,
        source_name,
        target,
        value,
        -(wrapper_prefix.len() as isize),
        runtime_component_name,
    )
}

fn convert_runtime_trans_root(
    original_source: &IndexedText<'_>,
    declaration_source_map: Option<&IndexedSourceMap>,
    source: &IndexedText<'_>,
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
        collect_jsx_attributes(source.as_str(), input, opening, base_offset)?,
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

fn convert_runtime_trans_root_svelte(
    original_source: &IndexedText<'_>,
    declaration_source_map: Option<&IndexedSourceMap>,
    source: &IndexedText<'_>,
    input: &MappedText<'_>,
    source_name: &str,
    target: &CompileTarget,
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
    let mut snippets = Vec::new();
    let original_input = MappedText::from_rendered(
        source_name,
        original_source.as_str(),
        original_source.as_str(),
        None,
    );

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

    let mut cursor = opening.walk();
    for child in opening.children_by_field_name("attribute", &mut cursor) {
        match child.kind() {
            "jsx_expression" => {
                let spread = spread_element_node(child)
                    .ok_or(RuntimeComponentError::ExpectedSpreadElementInJsxSpreadAttribute)?;
                let argument = spread_argument_node(spread)
                    .ok_or(RuntimeComponentError::ExpectedSpreadElementInJsxSpreadAttribute)?;

                if let Some(object) = lowerable_object_expression_node(argument) {
                    let spread_span = translated_span(spread, base_offset)?;
                    let object_span = translated_span(object, base_offset)?;
                    let lowered = lower_svelte_object_expression_span(
                        source.as_str(),
                        input,
                        &original_input,
                        original_source.as_str(),
                        target,
                        object_span,
                        0,
                    )?;
                    mapped.push_unmapped(" {...");
                    let prefix_start = (spread_span.start + 3).min(object_span.start);
                    let prefix_trimmed_start = source.as_str()[prefix_start..object_span.start]
                        .find(|char: char| !char.is_ascii_whitespace())
                        .map(|offset| prefix_start + offset);
                    if let Some(prefix_trimmed_start) = prefix_trimmed_start {
                        push_copied_span(
                            &mut mapped,
                            input,
                            Span::new(prefix_trimmed_start, object_span.start),
                        )?;
                    }
                    append_rendered(&mut mapped, lowered.props);
                    let suffix_trimmed_end = source.as_str()[object_span.end..spread_span.end]
                        .rfind(|char: char| !char.is_ascii_whitespace())
                        .map(|offset| object_span.end + offset + 1);
                    if let Some(suffix_trimmed_end) = suffix_trimmed_end {
                        push_copied_span(
                            &mut mapped,
                            input,
                            Span::new(object_span.end, suffix_trimmed_end),
                        )?;
                    }
                    mapped.push_unmapped("}");
                    snippets.extend(lowered.snippets);
                    continue;
                }

                mapped.push_unmapped(" ");
                push_copied_span(&mut mapped, input, translated_span(child, base_offset)?)?;
            }
            "jsx_attribute" => {
                let name_node = jsx_attribute_name_node(child)
                    .ok_or(RuntimeComponentError::MissingJsxAttributeName)?;
                let name = source_slice(source.as_str(), name_node, base_offset)?;
                let value_node = jsx_attribute_value_node(child);

                if name == "components" {
                    if let Some(value) = value_node.filter(|value| value.kind() == "jsx_expression")
                    {
                        if let Some(expression) = first_named_child(value) {
                            if let Some(component_snippets) = collect_svelte_component_snippets(
                                &original_input,
                                original_source.as_str(),
                                target,
                                source.as_str(),
                                expression,
                                base_offset,
                            )? {
                                snippets.extend(component_snippets);
                                continue;
                            }
                        }
                    }
                }

                append_rendered(
                    &mut mapped,
                    convert_jsx_named_attribute(source.as_str(), input, child, base_offset)?,
                );
            }
            other => {
                return Err(RuntimeComponentError::UnsupportedJsxAttributeNodeKind {
                    kind: other.to_string(),
                });
            }
        }
    }

    if snippets.is_empty() {
        push_anchor_mapped(
            &mut mapped,
            declaration_source_map,
            source,
            original_source,
            " />",
            root_span.end,
        );
    } else {
        push_anchor_mapped(
            &mut mapped,
            declaration_source_map,
            source,
            original_source,
            ">",
            root_span.end,
        );
        mapped.push_unmapped("\n");
        for snippet in snippets {
            append_rendered(&mut mapped, snippet);
            mapped.push_unmapped("\n");
        }
        push_anchor_mapped(
            &mut mapped,
            declaration_source_map,
            source,
            original_source,
            "</",
            root_span.end,
        );
        push_anchor_mapped(
            &mut mapped,
            declaration_source_map,
            source,
            original_source,
            runtime_component_name,
            root_span.end,
        );
        push_anchor_mapped(
            &mut mapped,
            declaration_source_map,
            source,
            original_source,
            ">",
            root_span.end,
        );
    }

    mapped.into_rendered().map_err(RuntimeComponentError::from)
}

struct SvelteLoweredObjectExpression {
    props: RenderedMappedText,
    snippets: Vec<RenderedMappedText>,
}

fn lower_svelte_object_expression_span(
    source: &str,
    input: &MappedText<'_>,
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    span: Span,
    indent_level: usize,
) -> Result<SvelteLoweredObjectExpression, RuntimeComponentError> {
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
        return Ok(SvelteLoweredObjectExpression {
            props: copy_span(input, span)?,
            snippets: Vec::new(),
        });
    }

    convert_svelte_object_expression(
        source,
        input,
        original_input,
        original_source,
        target,
        object,
        span.start as isize - wrapper_prefix.len() as isize,
        indent_level,
    )
}

fn convert_svelte_object_expression(
    source: &str,
    input: &MappedText<'_>,
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<SvelteLoweredObjectExpression, RuntimeComponentError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = input.empty_like();
    let mut snippets = Vec::new();
    let mut cursor = node.walk();
    let mut wrote_entry = false;

    rendered.push_unmapped("{");

    for child in node.named_children(&mut cursor) {
        match child.kind() {
            "pair" => {
                let key = child
                    .child_by_field_name("key")
                    .ok_or(RuntimeComponentError::MissingObjectPairKey)?;
                let value = child
                    .child_by_field_name("value")
                    .ok_or(RuntimeComponentError::MissingObjectPairValue)?;
                let key_name = key_name(source, key, base_offset);
                if key_name.as_deref() == Some("components") {
                    if let Some(component_snippets) = collect_svelte_component_snippets(
                        original_input,
                        original_source,
                        target,
                        source,
                        value,
                        base_offset,
                    )? {
                        snippets.extend(component_snippets);
                        continue;
                    }
                }

                if wrote_entry {
                    rendered.push_unmapped(",\n");
                } else {
                    rendered.push_unmapped("\n");
                    wrote_entry = true;
                }
                rendered.push_unmapped(&child_indent);
                push_copied_span(&mut rendered, input, translated_span(key, base_offset)?)?;
                rendered.push_unmapped(": ");
                append_rendered(
                    &mut rendered,
                    convert_svelte_expression_for_runtime_trans(
                        source,
                        input,
                        original_input,
                        original_source,
                        target,
                        value,
                        base_offset,
                        indent_level + 1,
                    )?,
                );
            }
            "spread_element" => {
                let argument = spread_argument_node(child)
                    .ok_or(RuntimeComponentError::MissingSpreadArgumentInObjectExpression)?;
                if wrote_entry {
                    rendered.push_unmapped(",\n");
                } else {
                    rendered.push_unmapped("\n");
                    wrote_entry = true;
                }
                rendered.push_unmapped(&child_indent);
                rendered.push_unmapped("...");
                append_rendered(
                    &mut rendered,
                    convert_svelte_expression_for_runtime_trans(
                        source,
                        input,
                        original_input,
                        original_source,
                        target,
                        argument,
                        base_offset,
                        indent_level + 1,
                    )?,
                );
            }
            "shorthand_property_identifier" => {
                if wrote_entry {
                    rendered.push_unmapped(",\n");
                } else {
                    rendered.push_unmapped("\n");
                    wrote_entry = true;
                }
                rendered.push_unmapped(&child_indent);
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

    Ok(SvelteLoweredObjectExpression {
        props: rendered
            .into_rendered()
            .map_err(RuntimeComponentError::from)?,
        snippets,
    })
}

fn collect_svelte_component_snippets(
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    transformed_source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<Option<Vec<RenderedMappedText>>, RuntimeComponentError> {
    if node.kind() != "object" {
        return Err(RuntimeComponentError::ExpectedObjectExpressionForRuntimeTransComponents);
    }

    let mut keys = Vec::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() != "pair" {
            return Err(RuntimeComponentError::ExpectedObjectExpressionForRuntimeTransComponents);
        }
        let Some(key) = child.child_by_field_name("key") else {
            return Err(RuntimeComponentError::MissingObjectPairKey);
        };
        let Some(key_name) = key_name(transformed_source, key, base_offset) else {
            return Err(RuntimeComponentError::MissingObjectPairKey);
        };
        keys.push(key_name);
    }

    Ok(Some(collect_svelte_component_snippets_from_source(
        original_input,
        original_source,
        target,
        &keys,
    )?))
}

fn collect_svelte_component_snippets_from_source(
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    keys: &[String],
) -> Result<Vec<RenderedMappedText>, RuntimeComponentError> {
    let tree = parse_svelte(original_source)?;
    let root = tree.root_node();
    let component_node = find_node_by_span(root, target.original_span)
        .ok_or(RuntimeComponentError::MissingOriginalSvelteTransNode)?;
    let mut wrappers = Vec::new();
    collect_svelte_runtime_component_wrappers(component_node, original_source, &mut wrappers);

    if wrappers.len() != keys.len() {
        return Err(
            RuntimeComponentError::MismatchedSvelteRuntimeComponentPlaceholderCount {
                expected: keys.len(),
                found: wrappers.len(),
            },
        );
    }

    keys.iter()
        .zip(wrappers)
        .map(|(key, wrapper)| {
            lower_original_svelte_wrapper_to_snippet(
                original_input,
                original_source,
                wrapper,
                &format!("component_{key}"),
            )
        })
        .collect()
}

fn collect_svelte_runtime_component_wrappers<'a>(
    node: Node<'a>,
    source: &str,
    wrappers: &mut Vec<Node<'a>>,
) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "element" => {
                if let Some(self_closing_tag) = child
                    .children(&mut child.walk())
                    .find(|grandchild| grandchild.kind() == "self_closing_tag")
                {
                    if !is_skipped_svelte_runtime_component_wrapper(source, self_closing_tag) {
                        wrappers.push(self_closing_tag);
                    }
                    continue;
                }

                if !is_skipped_svelte_runtime_component_wrapper(source, child) {
                    wrappers.push(child);
                }
                collect_svelte_runtime_component_wrappers(child, source, wrappers);
            }
            "self_closing_tag" => {
                if !is_skipped_svelte_runtime_component_wrapper(source, child) {
                    wrappers.push(child);
                }
            }
            _ => collect_svelte_runtime_component_wrappers(child, source, wrappers),
        }
    }
}

fn is_skipped_svelte_runtime_component_wrapper(source: &str, node: Node<'_>) -> bool {
    matches!(
        svelte_tag_name(source, node),
        Some("Plural" | "Select" | "SelectOrdinal" | "Trans")
    )
}

fn svelte_tag_name<'a>(source: &'a str, node: Node<'_>) -> Option<&'a str> {
    match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag")
            .and_then(|start_tag| {
                start_tag
                    .children(&mut start_tag.walk())
                    .find(|child| child.kind() == "tag_name")
            })
            .map(|tag_name| &source[tag_name.start_byte()..tag_name.end_byte()]),
        "self_closing_tag" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "tag_name")
            .map(|tag_name| &source[tag_name.start_byte()..tag_name.end_byte()]),
        _ => None,
    }
}

fn lower_original_svelte_wrapper_to_snippet(
    input: &MappedText<'_>,
    source: &str,
    node: Node<'_>,
    snippet_name: &str,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    let mut rendered = input.empty_like();
    rendered.push_unmapped("{#snippet ");
    rendered.push_unmapped(snippet_name);
    rendered.push_unmapped("(children)}");

    match node.kind() {
        "element" => {
            let start_tag = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "start_tag")
                .ok_or(RuntimeComponentError::ExpectedJsxElementDescriptor)?;
            let end_tag = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "end_tag")
                .ok_or(RuntimeComponentError::ExpectedJsxElementDescriptor)?;
            let content_start = start_tag.end_byte();
            let content_end = end_tag.start_byte();
            push_copied_span(
                &mut rendered,
                input,
                Span::new(node.start_byte(), content_start),
            )?;
            rendered.push_unmapped("{@render children?.()}");
            push_copied_span(
                &mut rendered,
                input,
                Span::new(content_end, node.end_byte()),
            )?;
        }
        "self_closing_tag" => {
            let tag_name = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "tag_name")
                .ok_or(RuntimeComponentError::MissingTagNameWhileLoweringSvelteSnippet)?;
            let tag_name_span = Span::from_node(tag_name);
            let node_span = Span::from_node(node);
            let source_slice = &source[node_span.start..node_span.end];
            let self_closing_offset = source_slice
                .rfind("/>")
                .ok_or(RuntimeComponentError::ExpectedJsxElementDescriptor)?;
            push_copied_span(
                &mut rendered,
                input,
                Span::new(node_span.start, node_span.start + self_closing_offset),
            )?;
            rendered.push_unmapped(">{@render children?.()}</");
            push_copied_span(&mut rendered, input, tag_name_span)?;
            rendered.push_unmapped(">");
        }
        _ => return Err(RuntimeComponentError::ExpectedJsxElementDescriptor),
    }

    rendered.push_unmapped("{/snippet}");
    rendered
        .into_rendered()
        .map_err(RuntimeComponentError::from)
}

fn push_anchor_mapped(
    mapped: &mut MappedText<'_>,
    declaration_source_map: Option<&IndexedSourceMap>,
    declaration_source: &IndexedText<'_>,
    original_source: &IndexedText<'_>,
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
        original_source,
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
    let spread = spread_element_node(node)
        .ok_or(RuntimeComponentError::ExpectedSpreadElementInJsxSpreadAttribute)?;
    let argument = spread_argument_node(spread)
        .ok_or(RuntimeComponentError::ExpectedSpreadElementInJsxSpreadAttribute)?;

    if let Some(object) = lowerable_object_expression_node(argument) {
        let spread_span = translated_span(spread, base_offset)?;
        let object_span = translated_span(object, base_offset)?;
        let mut rendered = input.empty_like();
        rendered.push_unmapped(" {...");
        let prefix_start = (spread_span.start + 3).min(object_span.start);
        let prefix_trimmed_start = source[prefix_start..object_span.start]
            .find(|char: char| !char.is_ascii_whitespace())
            .map(|offset| prefix_start + offset);
        if let Some(prefix_trimmed_start) = prefix_trimmed_start {
            push_copied_span(
                &mut rendered,
                input,
                Span::new(prefix_trimmed_start, object_span.start),
            )?;
        }
        append_rendered(
            &mut rendered,
            lower_object_expression_span(source, input, object_span, false, 0)?,
        );
        let suffix_trimmed_end = source[object_span.end..spread_span.end]
            .rfind(|char: char| !char.is_ascii_whitespace())
            .map(|offset| object_span.end + offset + 1);
        if let Some(suffix_trimmed_end) = suffix_trimmed_end {
            push_copied_span(
                &mut rendered,
                input,
                Span::new(object_span.end, suffix_trimmed_end),
            )?;
        }
        rendered.push_unmapped("}");
        return rendered
            .into_rendered()
            .map_err(RuntimeComponentError::from);
    }

    let mut rendered = input.empty_like();
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

fn convert_svelte_expression_for_runtime_trans(
    source: &str,
    input: &MappedText<'_>,
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<RenderedMappedText, RuntimeComponentError> {
    match node.kind() {
        "object" => convert_svelte_object_expression(
            source,
            input,
            original_input,
            original_source,
            target,
            node,
            base_offset,
            indent_level,
        )
        .map(|lowered| lowered.props),
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
    if let Some(map) = rendered.indexed_source_map {
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

fn lowerable_object_expression_node(node: Node<'_>) -> Option<Node<'_>> {
    match node.kind() {
        "object" => Some(node),
        "parenthesized_expression" => {
            first_named_child(node).and_then(lowerable_object_expression_node)
        }
        _ => None,
    }
}

fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    node.named_children(&mut node.walk()).next()
}

fn spread_element_node(node: Node<'_>) -> Option<Node<'_>> {
    node.named_children(&mut node.walk())
        .find(|child| child.kind() == "spread_element")
}

fn spread_argument_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("argument").or_else(|| {
        node.named_children(&mut node.walk())
            .find(|child| child.kind() != "comment")
    })
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

fn find_node_by_span(node: Node<'_>, span: Span) -> Option<Node<'_>> {
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

fn key_name(source: &str, key: Node<'_>, base_offset: isize) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::{lower_runtime_component_markup, lower_runtime_component_markup_svelte};
    use crate::common::{RenderedMappedText, Span};
    use crate::compile::{
        CompileTarget, CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode,
    };
    use crate::framework::MacroFlavor;
    use crate::synthesis::NormalizedSegment;
    use indoc::indoc;

    fn svelte_component_target(source: &str) -> CompileTarget {
        CompileTarget {
            declaration_id: "__trans".to_string(),
            original_span: Span::new(0, source.len()),
            normalized_span: Span::new(0, source.len()),
            source_map_anchor: None,
            local_name: "Trans".to_string(),
            imported_name: "Trans".to_string(),
            flavor: MacroFlavor::Direct,
            context: CompileTargetContext::Template,
            output_kind: CompileTargetOutputKind::Component,
            translation_mode: CompileTranslationMode::Contextual,
            normalized_segments: Vec::<NormalizedSegment>::new(),
        }
    }

    #[test]
    fn preserves_non_object_spread_without_duplicate_prefix() {
        let source = "<Trans {...foo()} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            indexed_source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(lowered.code, "<L4sRuntimeTrans {...foo()} />");
    }

    #[test]
    fn preserves_conditional_spread_wrapping_object_literals() {
        let source = "<Trans {...(cond ? { title: <strong /> } : other)} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            indexed_source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            "<L4sRuntimeTrans {...(cond ? { title: <strong /> } : other)} />"
        );
    }

    #[test]
    fn preserves_call_wrapped_object_literal_spreads() {
        let source = "<Trans {...fn({ title: <strong /> })} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            indexed_source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            "<L4sRuntimeTrans {...fn({ title: <strong /> })} />"
        );
    }

    #[test]
    fn lowers_object_spread_through_prefixed_object_path() {
        let source = "<Trans {...{}} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            indexed_source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(lowered.code, "<L4sRuntimeTrans {...{}} />");
    }

    #[test]
    fn lowers_object_spread_with_leading_comment_prefix() {
        let source =
            "<Trans {.../*i18n*/ { components: { 0: <a href=\"/docs\" /> } }} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            indexed_source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("lower succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {.../*i18n*/ {
                  components: {
                    0: {
                      kind: "element",
                      tag: "a",
                      props: {
                        href: "/docs"
                      }
                    }
                  }
                }} />
            "#}
            .trim_end()
        );
    }

    #[test]
    fn lowers_parenthesized_object_spread() {
        let source = "<Trans {...({ count: 1, nested: { ok: true } })} />".to_string();
        let declaration = RenderedMappedText {
            code: source.clone(),
            indexed_source_map: None,
        };

        let lowered = lower_runtime_component_markup(
            "Component.svelte",
            &source,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {...({
                  count: 1,
                  nested: {
                    ok: true
                  }
                })} />
            "#}
            .trim_end()
        );
    }

    #[test]
    fn lowers_svelte_components_to_implicit_snippets() {
        let source = "<Trans>Read the <a href=\"/docs\">docs</a>.</Trans>".to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read the <0>docs</0>.\", components: { 0: <a href=\"/docs\" /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = svelte_component_target(&source);

        let lowered = lower_runtime_component_markup_svelte(
            "Component.svelte",
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("svelte runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {.../*i18n*/ {
                  id: "demo.docs",
                  message: "Read the <0>docs</0>."
                }}>
                {#snippet component_0(children)}<a href="/docs">{@render children?.()}</a>{/snippet}
                </L4sRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn lowers_svelte_components_from_original_source_wrappers() {
        let source =
            "<Trans>Read <strong><DocLink href=\"/docs\">carefully</DocLink></strong>.</Trans>"
                .to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read <0><1>carefully</1></0>.\", components: { 0: <strong />, 1: <DocLink href=\"/docs\" /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = svelte_component_target(&source);

        let lowered = lower_runtime_component_markup_svelte(
            "Component.svelte",
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("svelte runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {.../*i18n*/ {
                  id: "demo.docs",
                  message: "Read <0><1>carefully</1></0>."
                }}>
                {#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}
                {#snippet component_1(children)}<DocLink href="/docs">{@render children?.()}</DocLink>{/snippet}
                </L4sRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn skips_svelte_component_macros_inside_runtime_trans_wrappers() {
        let source = indoc! {r##"
            <Trans>
              You have{" "}
              <strong>
                <Plural
                  value={count}
                  _0="no unread messages"
                  one="# unread message"
                  other="# unread messages"
                />
              </strong>.
            </Trans>
        "##}
        .trim()
        .to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.plural\", message: \"You have <0>{count, plural, =0 {no unread messages} one {# unread message} other {# unread messages}}</0>.\", values: { count }, components: { 0: <strong /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = svelte_component_target(&source);

        let lowered = lower_runtime_component_markup_svelte(
            "Component.svelte",
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("svelte runtime component lowering succeeds");

        assert!(lowered.code.contains(
            "{#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}"
        ));
    }

    #[test]
    fn skips_nested_svelte_component_macro_wrappers_inside_runtime_trans() {
        let source = indoc! {r##"
            <Trans>
              Before{" "}
              <strong>
                <Plural
                  value={count}
                  _0={selectOrdinal(rank, {
                    1: select(role, {
                      admin: "zero first admin",
                      other: "zero first other",
                    }),
                    other: select(role, {
                      admin: "zero later admin",
                      other: "zero later other",
                    }),
                  })}
                  other="fallback"
                />
              </strong>{" "}
              after.
            </Trans>
        "##}
        .trim()
        .to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.deep\", message: \"Before <0>{count, plural, =0 {{rank, selectordinal, one {{role, select, admin {zero first admin} other {zero first other}}} other {{role, select, admin {zero later admin} other {zero later other}}}} other {fallback}}</0> after.\", values: { count, rank, role }, components: { 0: <strong /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = svelte_component_target(&source);

        let lowered = lower_runtime_component_markup_svelte(
            "Component.svelte",
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
        )
        .expect("svelte runtime component lowering succeeds");

        assert!(lowered.code.contains(
            "{#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}"
        ));
    }
}
