use tree_sitter::Node;

use crate::common::{IndexedSourceMap, IndexedText, MappedText, RenderedMappedText, Span};
use crate::compile::CompileTarget;
use crate::compile::runtime_component::{
    RuntimeComponentError, append_rendered, convert_expression_for_runtime_trans,
    convert_jsx_named_attribute, copy_span, find_first_named_descendant, find_node_by_span,
    first_named_child, jsx_attribute_name_node, jsx_attribute_value_node, key_name,
    lowerable_object_expression_node, push_anchor_mapped, push_copied_span, source_slice,
    spread_argument_node, spread_element_node, translated_span, validate_runtime_placeholder_key,
};
use crate::framework::parse::{parse_astro, parse_tsx};

use super::AstroAdapterError;

struct AstroLoweredObjectExpression {
    props: RenderedMappedText,
    slot_callbacks: Vec<RenderedMappedText>,
    placeholder_keys: Vec<String>,
}

struct AstroRuntimeLoweringContext<'a> {
    original_source: &'a IndexedText<'a>,
    declaration_source_map: Option<&'a IndexedSourceMap>,
    source: &'a IndexedText<'a>,
    input: &'a MappedText<'a>,
    original_input: MappedText<'a>,
    target: &'a CompileTarget,
    runtime_component_name: &'a str,
}

pub(crate) fn lower_runtime_component_markup(
    source_name: &str,
    original_source: &str,
    target: &CompileTarget,
    declaration: &RenderedMappedText,
    runtime_component_name: &str,
) -> Result<RenderedMappedText, AstroAdapterError> {
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
    let original_input = MappedText::from_rendered(
        source_name,
        original_source.as_str(),
        original_source.as_str(),
        None,
    );
    let context = AstroRuntimeLoweringContext {
        original_source: &original_source,
        declaration_source_map: declaration.indexed_source_map.as_ref(),
        source: &declaration_source,
        input: &mapped_input,
        original_input,
        target,
        runtime_component_name,
    };

    convert_runtime_trans_root(&context, value, -(wrapper_prefix.len() as isize))
}

fn convert_runtime_trans_root(
    context: &AstroRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
) -> Result<RenderedMappedText, AstroAdapterError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or(RuntimeComponentError::ExpectedJsxElementInitializerForTransformedComponent)?;

    let mut mapped = context.input.empty_like();
    let mut attributes = context.input.empty_like();
    let root_span = translated_span(node, base_offset)?;
    let mut slot_callbacks = Vec::new();
    let mut placeholder_keys = Vec::new();

    push_anchor_mapped(
        &mut mapped,
        context.declaration_source_map,
        context.source,
        context.original_source,
        "<",
        root_span.start,
    );
    push_anchor_mapped(
        &mut mapped,
        context.declaration_source_map,
        context.source,
        context.original_source,
        context.runtime_component_name,
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
                    let lowered = lower_object_expression_span(context, object_span, 0)?;
                    attributes.push_unmapped(" {...");
                    let prefix_start = (spread_span.start + 3).min(object_span.start);
                    let prefix_trimmed_start = context.source.as_str()
                        [prefix_start..object_span.start]
                        .find(|char: char| !char.is_ascii_whitespace())
                        .map(|offset| prefix_start + offset);
                    if let Some(prefix_trimmed_start) = prefix_trimmed_start {
                        push_copied_span(
                            &mut attributes,
                            context.input,
                            Span::new(prefix_trimmed_start, object_span.start),
                        )?;
                    }
                    append_rendered(&mut attributes, lowered.props);
                    let suffix_trimmed_end = context.source.as_str()
                        [object_span.end..spread_span.end]
                        .rfind(|char: char| !char.is_ascii_whitespace())
                        .map(|offset| object_span.end + offset + 1);
                    if let Some(suffix_trimmed_end) = suffix_trimmed_end {
                        push_copied_span(
                            &mut attributes,
                            context.input,
                            Span::new(object_span.end, suffix_trimmed_end),
                        )?;
                    }
                    attributes.push_unmapped("}");
                    slot_callbacks.extend(lowered.slot_callbacks);
                    placeholder_keys.extend(lowered.placeholder_keys);
                    continue;
                }

                attributes.push_unmapped(" ");
                push_copied_span(
                    &mut attributes,
                    context.input,
                    translated_span(child, base_offset)?,
                )?;
            }
            "jsx_attribute" => {
                let name_node = jsx_attribute_name_node(child)
                    .ok_or(RuntimeComponentError::MissingJsxAttributeName)?;
                let name = source_slice(context.source.as_str(), name_node, base_offset)?;
                let value_node = jsx_attribute_value_node(child);

                if name == "components"
                    && let Some(value) = value_node.filter(|value| value.kind() == "jsx_expression")
                    && let Some(expression) = first_named_child(value)
                    && let Some(component_slots) = collect_component_slot_callbacks(
                        &context.original_input,
                        context.original_source.as_str(),
                        context.target,
                        context.source.as_str(),
                        expression,
                        base_offset,
                    )?
                {
                    slot_callbacks.extend(component_slots.slot_callbacks);
                    placeholder_keys.extend(component_slots.placeholder_keys);
                    continue;
                }

                append_rendered(
                    &mut attributes,
                    convert_jsx_named_attribute(
                        context.source.as_str(),
                        context.input,
                        child,
                        base_offset,
                    )?,
                );
            }
            other => {
                return Err(
                    RuntimeComponentError::UnsupportedJsxAttributeNodeKind { kind: other }.into(),
                );
            }
        }
    }

    if !placeholder_keys.is_empty() {
        mapped.push_unmapped(" placeholders={");
        mapped.push_unmapped(render_placeholder_keys_inline(&placeholder_keys));
        mapped.push_unmapped("}");
    }
    append_rendered(
        &mut mapped,
        attributes
            .into_rendered()
            .map_err(AstroAdapterError::from)?,
    );

    if slot_callbacks.is_empty() {
        push_anchor_mapped(
            &mut mapped,
            context.declaration_source_map,
            context.source,
            context.original_source,
            " />",
            root_span.end,
        );
    } else {
        push_anchor_mapped(
            &mut mapped,
            context.declaration_source_map,
            context.source,
            context.original_source,
            ">",
            root_span.end,
        );
        mapped.push_unmapped("\n");
        for slot_callback in slot_callbacks {
            append_rendered(&mut mapped, slot_callback);
            mapped.push_unmapped("\n");
        }
        push_anchor_mapped(
            &mut mapped,
            context.declaration_source_map,
            context.source,
            context.original_source,
            "</",
            root_span.end,
        );
        push_anchor_mapped(
            &mut mapped,
            context.declaration_source_map,
            context.source,
            context.original_source,
            context.runtime_component_name,
            root_span.end,
        );
        push_anchor_mapped(
            &mut mapped,
            context.declaration_source_map,
            context.source,
            context.original_source,
            ">",
            root_span.end,
        );
    }

    mapped.into_rendered().map_err(Into::into)
}

fn lower_object_expression_span(
    context: &AstroRuntimeLoweringContext<'_>,
    span: Span,
    indent_level: usize,
) -> Result<AstroLoweredObjectExpression, AstroAdapterError> {
    let text = &context.source.as_str()[span.start..span.end];
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
        return Ok(AstroLoweredObjectExpression {
            props: copy_span(context.input, span)?,
            slot_callbacks: Vec::new(),
            placeholder_keys: Vec::new(),
        });
    }

    convert_object_expression(
        context,
        object,
        span.start as isize - wrapper_prefix.len() as isize,
        indent_level,
    )
}

fn convert_object_expression(
    context: &AstroRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
) -> Result<AstroLoweredObjectExpression, AstroAdapterError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = context.input.empty_like();
    let mut slot_callbacks = Vec::new();
    let mut placeholder_keys = Vec::new();
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
                let key_name = key_name(context.source.as_str(), key, base_offset);
                if key_name.as_deref() == Some("components")
                    && let Some(component_slots) = collect_component_slot_callbacks(
                        &context.original_input,
                        context.original_source.as_str(),
                        context.target,
                        context.source.as_str(),
                        value,
                        base_offset,
                    )?
                {
                    slot_callbacks.extend(component_slots.slot_callbacks);
                    placeholder_keys.extend(component_slots.placeholder_keys);
                    continue;
                }

                if wrote_entry {
                    rendered.push_unmapped(",\n");
                } else {
                    rendered.push_unmapped("\n");
                    wrote_entry = true;
                }
                rendered.push_unmapped(&child_indent);
                push_copied_span(
                    &mut rendered,
                    context.input,
                    translated_span(key, base_offset)?,
                )?;
                rendered.push_unmapped(": ");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        context.source.as_str(),
                        context.input,
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
                    convert_expression_for_runtime_trans(
                        context.source.as_str(),
                        context.input,
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
                push_copied_span(
                    &mut rendered,
                    context.input,
                    translated_span(child, base_offset)?,
                )?;
            }
            other => {
                return Err(
                    RuntimeComponentError::UnsupportedObjectChildKind { kind: other }.into(),
                );
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

    Ok(AstroLoweredObjectExpression {
        props: rendered.into_rendered().map_err(AstroAdapterError::from)?,
        slot_callbacks,
        placeholder_keys,
    })
}

fn collect_component_slot_callbacks(
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    transformed_source: &str,
    node: Node<'_>,
    base_offset: isize,
) -> Result<Option<AstroLoweredComponentSlots>, AstroAdapterError> {
    let node = match node.kind() {
        "parenthesized_expression" => first_named_child(node).unwrap_or(node),
        _ => node,
    };

    if node.kind() != "object" {
        return Ok(None);
    }

    let mut keys = Vec::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() != "pair" {
            return Err(
                RuntimeComponentError::ExpectedObjectExpressionForRuntimeTransComponents.into(),
            );
        }
        let Some(key) = child.child_by_field_name("key") else {
            return Err(RuntimeComponentError::MissingObjectPairKey.into());
        };
        let Some(key_name) = key_name(transformed_source, key, base_offset) else {
            return Err(RuntimeComponentError::MissingObjectPairKey.into());
        };
        keys.push(validate_runtime_placeholder_key(key_name)?);
    }

    Ok(Some(collect_component_slot_callbacks_from_source(
        original_input,
        original_source,
        target,
        &keys,
    )?))
}

fn collect_component_slot_callbacks_from_source(
    original_input: &MappedText<'_>,
    original_source: &str,
    target: &CompileTarget,
    keys: &[String],
) -> Result<AstroLoweredComponentSlots, AstroAdapterError> {
    let tree = parse_astro(original_source)?;
    let root = tree.root_node();
    let component_node = find_node_by_span(root, target.original_span)
        .ok_or(AstroAdapterError::MissingOriginalAstroTransNode)?;
    let mut wrappers = Vec::new();
    collect_runtime_component_wrappers(component_node, original_source, &mut wrappers);

    if wrappers.len() != keys.len() {
        return Err(
            AstroAdapterError::MismatchedAstroRuntimeComponentPlaceholderCount {
                expected: keys.len(),
                found: wrappers.len(),
            },
        );
    }

    let slot_callbacks = keys
        .iter()
        .zip(wrappers)
        .map(|(key, wrapper)| {
            lower_original_wrapper_to_slot_callback(
                original_input,
                wrapper,
                &format!("component_{key}"),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(AstroLoweredComponentSlots {
        slot_callbacks,
        placeholder_keys: keys.to_vec(),
    })
}

struct AstroLoweredComponentSlots {
    slot_callbacks: Vec<RenderedMappedText>,
    placeholder_keys: Vec<String>,
}

fn render_placeholder_keys_inline(keys: &[String]) -> String {
    let joined = keys
        .iter()
        .map(|key| format!("\"{key}\""))
        .collect::<Vec<_>>()
        .join(", ");
    format!("[{joined}]")
}

fn collect_runtime_component_wrappers<'a>(
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
                    if !is_skipped_runtime_component_wrapper(source, self_closing_tag) {
                        wrappers.push(self_closing_tag);
                    }
                    continue;
                }

                if !is_skipped_runtime_component_wrapper(source, child) {
                    wrappers.push(child);
                }
                collect_runtime_component_wrappers(child, source, wrappers);
            }
            "self_closing_tag" => {
                if !is_skipped_runtime_component_wrapper(source, child) {
                    wrappers.push(child);
                }
            }
            _ => collect_runtime_component_wrappers(child, source, wrappers),
        }
    }
}

fn is_skipped_runtime_component_wrapper(source: &str, node: Node<'_>) -> bool {
    matches!(
        tag_name(source, node),
        Some("Plural" | "Select" | "SelectOrdinal" | "Trans")
    )
}

fn tag_name<'a>(source: &'a str, node: Node<'_>) -> Option<&'a str> {
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

fn lower_original_wrapper_to_slot_callback(
    input: &MappedText<'_>,
    node: Node<'_>,
    slot_name: &str,
) -> Result<RenderedMappedText, AstroAdapterError> {
    let mut rendered = input.empty_like();
    rendered.push_unmapped("<fragment slot=\"");
    rendered.push_unmapped(slot_name);
    rendered.push_unmapped("\">{(children) => ");

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
            rendered.push_unmapped("<Fragment set:html={children} />");
            push_copied_span(
                &mut rendered,
                input,
                Span::new(content_end, node.end_byte()),
            )?;
        }
        "self_closing_tag" => {
            node.children(&mut node.walk())
                .find(|child| child.kind() == "tag_name")
                .ok_or(AstroAdapterError::MissingTagNameWhileLoweringAstroSlotCallback)?;
            push_copied_span(&mut rendered, input, Span::from_node(node))?;
        }
        _ => return Err(RuntimeComponentError::ExpectedJsxElementDescriptor.into()),
    }

    rendered.push_unmapped("}</fragment>");
    rendered.into_rendered().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::lower_runtime_component_markup;
    use crate::common::{RenderedMappedText, Span};
    use crate::compile::{
        CompileTarget, CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode,
    };
    use crate::framework::MacroFlavor;
    use crate::synthesis::NormalizedSegment;
    use indoc::indoc;

    fn component_target(source: &str) -> CompileTarget {
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
    fn lowers_components_to_named_slot_callbacks() {
        let source = "<Trans>Read the <a href=\"/docs\">docs</a>.</Trans>".to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read the <0>docs</0>.\", components: { 0: <a href=\"/docs\" /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            "Component.astro",
            &source,
            &target,
            &declaration,
            "L4aRuntimeTrans",
        )
        .expect("astro runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4aRuntimeTrans placeholders={["0"]} {.../*i18n*/ {
                  id: "demo.docs",
                  message: "Read the <0>docs</0>."
                }}>
                <fragment slot="component_0">{(children) => <a href="/docs"><Fragment set:html={children} /></a>}</fragment>
                </L4aRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn lowers_components_from_original_source_wrappers() {
        let source =
            "<Trans>Read <strong><DocLink href=\"/docs\">carefully</DocLink></strong>.</Trans>"
                .to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read <0><1>carefully</1></0>.\", components: { 0: <strong />, 1: <DocLink href=\"/docs\" /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            "Component.astro",
            &source,
            &target,
            &declaration,
            "L4aRuntimeTrans",
        )
        .expect("astro runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4aRuntimeTrans placeholders={["0", "1"]} {.../*i18n*/ {
                  id: "demo.docs",
                  message: "Read <0><1>carefully</1></0>."
                }}>
                <fragment slot="component_0">{(children) => <strong><Fragment set:html={children} /></strong>}</fragment>
                <fragment slot="component_1">{(children) => <DocLink href="/docs"><Fragment set:html={children} /></DocLink>}</fragment>
                </L4aRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn rejects_unsafe_placeholder_keys() {
        let source = "<Trans>Read the <a href=\"/docs\">docs</a>.</Trans>".to_string();
        let declaration = RenderedMappedText {
            code: "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read the <0>docs</0>.\", components: { \"bad-key\": <a href=\"/docs\" /> } }} />".to_string(),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let error = lower_runtime_component_markup(
            "Component.astro",
            &source,
            &target,
            &declaration,
            "L4aRuntimeTrans",
        )
        .expect_err("unsafe placeholder key should be rejected");

        assert!(error.to_string().contains(
            "runtime component placeholder key contains unsupported characters: bad-key"
        ));
    }
}
