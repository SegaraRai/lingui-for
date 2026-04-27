use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{
    IndexedSourceMap, IndexedText, MappedText, RenderedMappedText, Span, build_span_anchor_map,
    node_text, span_text,
};
use crate::framework::astro::markup::is_fragment_wrapper;
use crate::syntax::parse::{parse_astro, parse_tsx};
use crate::transform::runtime_component::{
    RuntimeComponentError, append_rendered,
    convert_expression_for_runtime_trans as convert_expression_for_runtime_trans_shared,
    convert_jsx_named_attribute, copy_span, find_first_named_descendant, find_node_by_span,
    first_named_child, jsx_attribute_name_node, jsx_attribute_value_node, key_name,
    lowerable_object_expression_node, push_anchor_mapped, push_copied_span, source_slice,
    spread_argument_node, spread_element_node, translated_span, validate_runtime_placeholder_key,
};
use crate::transform::{RuntimeWarningMode, TransformTarget};

use super::AstroAdapterError;

struct AstroLoweredObjectExpression {
    props: RenderedMappedText,
    slot_callbacks: Vec<RenderedMappedText>,
    placeholder_keys: Vec<LeanString>,
}

struct AstroRuntimeLoweringContext<'a> {
    original_source: &'a IndexedText<'a>,
    declaration_source_map: Option<&'a IndexedSourceMap>,
    source: &'a IndexedText<'a>,
    input: &'a MappedText<'a>,
    original_input: MappedText<'a>,
    target: &'a TransformTarget,
    runtime_component_name: &'a LeanString,
}

pub(crate) fn lower_runtime_component_markup(
    source_name: &LeanString,
    original_source: &LeanString,
    target: &TransformTarget,
    declaration: &RenderedMappedText,
    runtime_component_name: LeanString,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, AstroAdapterError> {
    let declaration_source = IndexedText::new(&declaration.code);
    let original_source_indexed = IndexedText::new(original_source);
    let mapped_input = MappedText::from_rendered(
        source_name,
        original_source,
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
    let original_input =
        MappedText::from_rendered(source_name, original_source, original_source, None);
    let context = AstroRuntimeLoweringContext {
        original_source: &original_source_indexed,
        declaration_source_map: declaration.indexed_source_map.as_ref(),
        source: &declaration_source,
        input: &mapped_input,
        original_input,
        target,
        runtime_component_name: &runtime_component_name,
    };

    convert_runtime_trans_root(
        &context,
        value,
        -(wrapper_prefix.len() as isize),
        runtime_warning_mode,
    )
}

fn convert_runtime_trans_root(
    context: &AstroRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    runtime_warning_mode: RuntimeWarningMode,
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
                    let lowered = lower_object_expression_node(
                        context,
                        object,
                        base_offset,
                        0,
                        runtime_warning_mode,
                    )?;
                    attributes.push_unmapped(" {...(/*i18n*/ ");
                    append_rendered(&mut attributes, lowered.props);
                    attributes.push_unmapped(")}");
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
                let name = source_slice(context.source.text(), name_node, base_offset)?;
                let value_node = jsx_attribute_value_node(child);

                if name == "components"
                    && let Some(value) = value_node.filter(|value| value.kind() == "jsx_expression")
                    && let Some(expression) = first_named_child(value)
                    && let Some(component_slots) = collect_component_slot_callbacks(
                        &context.original_input,
                        context.original_source.text(),
                        context.target,
                        context.source.text(),
                        expression,
                        base_offset,
                        runtime_warning_mode,
                    )?
                {
                    slot_callbacks.extend(component_slots.slot_callbacks);
                    placeholder_keys.extend(component_slots.placeholder_keys);
                    continue;
                }

                append_rendered(
                    &mut attributes,
                    convert_jsx_named_attribute(
                        context.source.text(),
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
        mapped.push_unmapped_dynamic(render_placeholder_keys_inline(&placeholder_keys));
        mapped.push_unmapped("}");
    }
    append_rendered(
        &mut mapped,
        attributes
            .into_rendered()
            .map_err(AstroAdapterError::from)?,
    );

    // RuntimeTrans is emitted as paired tags in both branches so slot callback
    // support does not depend on the original JSX descriptor being self-closing.
    if slot_callbacks.is_empty() {
        push_anchor_mapped(
            &mut mapped,
            context.declaration_source_map,
            context.source,
            context.original_source,
            "></",
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

fn lower_object_expression_node(
    context: &AstroRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<AstroLoweredObjectExpression, AstroAdapterError> {
    let object = lowerable_object_expression_node(node).unwrap_or(node);
    if object.kind() != "object" {
        let span = translated_span(node, base_offset)?;
        return Ok(AstroLoweredObjectExpression {
            props: copy_span(context.input, span)?,
            slot_callbacks: Vec::new(),
            placeholder_keys: Vec::new(),
        });
    }

    convert_object_expression(
        context,
        object,
        base_offset,
        indent_level,
        runtime_warning_mode,
    )
}

fn convert_object_expression(
    context: &AstroRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
    runtime_warning_mode: RuntimeWarningMode,
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
                let key_name = key_name(context.source.text(), key, base_offset);
                if key_name == Some("components")
                    && let Some(component_slots) = collect_component_slot_callbacks(
                        &context.original_input,
                        context.original_source.text(),
                        context.target,
                        context.source.text(),
                        value,
                        base_offset,
                        runtime_warning_mode,
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
                rendered.push_unmapped_dynamic(&child_indent);
                push_copied_span(
                    &mut rendered,
                    context.input,
                    translated_span(key, base_offset)?,
                )?;
                rendered.push_unmapped(": ");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        context,
                        value,
                        base_offset,
                        indent_level + 1,
                        runtime_warning_mode,
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
                rendered.push_unmapped_dynamic(&child_indent);
                rendered.push_unmapped("...");
                append_rendered(
                    &mut rendered,
                    convert_expression_for_runtime_trans(
                        context,
                        argument,
                        base_offset,
                        indent_level + 1,
                        runtime_warning_mode,
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
                rendered.push_unmapped_dynamic(&child_indent);
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
        rendered.push_unmapped_dynamic(&indent);
        rendered.push_unmapped("}");
    }

    Ok(AstroLoweredObjectExpression {
        props: rendered.into_rendered().map_err(AstroAdapterError::from)?,
        slot_callbacks,
        placeholder_keys,
    })
}

fn convert_expression_for_runtime_trans(
    context: &AstroRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, AstroAdapterError> {
    match node.kind() {
        "object" => convert_object_expression(
            context,
            node,
            base_offset,
            indent_level,
            runtime_warning_mode,
        )
        .map(|lowered| lowered.props),
        _ => Ok(convert_expression_for_runtime_trans_shared(
            context.source.text(),
            context.input,
            node,
            base_offset,
            indent_level,
        )?),
    }
}

fn collect_component_slot_callbacks(
    original_input: &MappedText<'_>,
    original_source: &LeanString,
    target: &TransformTarget,
    transformed_source: &str,
    node: Node<'_>,
    base_offset: isize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<Option<AstroLoweredComponentSlots>, AstroAdapterError> {
    let node = match node.kind() {
        "parenthesized_expression" => first_named_child(node).unwrap_or(node),
        _ => node,
    };

    if node.kind() != "object" {
        return Ok(None);
    }

    let mut placeholders = Vec::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() != "pair" {
            return Err(
                RuntimeComponentError::ExpectedObjectExpressionForRuntimeTransComponents.into(),
            );
        }
        let key = child
            .child_by_field_name("key")
            .ok_or(RuntimeComponentError::MissingObjectPairKey)?;
        let key_name = key_name(transformed_source, key, base_offset)
            .ok_or(RuntimeComponentError::MissingObjectPairKey)?;
        let value = child
            .child_by_field_name("value")
            .ok_or(RuntimeComponentError::MissingObjectPairValue)?;
        validate_component_placeholder_value(value)?;
        placeholders.push(AstroRuntimeComponentPlaceholder {
            key: LeanString::from(validate_runtime_placeholder_key(key_name)?),
        });
    }

    Ok(Some(collect_component_slot_callbacks_from_source(
        original_input,
        original_source,
        target,
        &placeholders,
        runtime_warning_mode,
    )?))
}

fn validate_component_placeholder_value(node: Node<'_>) -> Result<(), AstroAdapterError> {
    let node = match node.kind() {
        "parenthesized_expression" | "jsx_expression" => first_named_child(node).unwrap_or(node),
        _ => node,
    };

    if matches!(node.kind(), "jsx_element" | "jsx_self_closing_element") {
        Ok(())
    } else {
        Err(RuntimeComponentError::ExpectedJsxElementDescriptor.into())
    }
}

fn collect_component_slot_callbacks_from_source(
    original_input: &MappedText<'_>,
    original_source: &LeanString,
    target: &TransformTarget,
    placeholders: &[AstroRuntimeComponentPlaceholder],
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<AstroLoweredComponentSlots, AstroAdapterError> {
    let tree = parse_astro(original_source)?;
    let root = tree.root_node();
    let wrappers = collect_runtime_component_wrappers_from_target(root, target, placeholders)?;

    let slot_callbacks = placeholders
        .iter()
        .zip(wrappers)
        .map(|(placeholder, wrapper)| {
            lower_original_wrapper_to_slot_callback(
                original_input,
                original_source,
                wrapper,
                &format!("component_{}", placeholder.key),
                runtime_warning_mode,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(AstroLoweredComponentSlots {
        slot_callbacks,
        placeholder_keys: placeholders
            .iter()
            .map(|placeholder| placeholder.key.clone())
            .collect(),
    })
}

fn collect_runtime_component_wrappers_from_target<'a>(
    root: Node<'a>,
    target: &TransformTarget,
    placeholders: &[AstroRuntimeComponentPlaceholder],
) -> Result<Vec<Node<'a>>, AstroAdapterError> {
    if target.runtime_component_wrapper_spans.len() != placeholders.len() {
        return Err(
            AstroAdapterError::MismatchedAstroRuntimeComponentPlaceholderCount {
                expected: placeholders.len(),
                found: target.runtime_component_wrapper_spans.len(),
            },
        );
    }

    target
        .runtime_component_wrapper_spans
        .iter()
        .map(|span| {
            find_node_by_span(root, *span).ok_or(AstroAdapterError::MissingOriginalAstroTransNode)
        })
        .collect()
}

struct AstroLoweredComponentSlots {
    slot_callbacks: Vec<RenderedMappedText>,
    placeholder_keys: Vec<LeanString>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AstroRuntimeComponentPlaceholder {
    key: LeanString,
}

fn render_placeholder_keys_inline(keys: &[LeanString]) -> String {
    let joined = keys
        .iter()
        .map(|key| format!("\"{key}\""))
        .collect::<Vec<_>>()
        .join(", ");
    format!("[{joined}]")
}

fn lower_original_wrapper_to_slot_callback(
    input: &MappedText<'_>,
    source: &LeanString,
    node: Node<'_>,
    slot_name: &str,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, AstroAdapterError> {
    let indexed_source = IndexedText::new(source);
    let mut rendered = input.empty_like();
    let has_content_hole = has_content_hole(source, node);
    if matches!(node.kind(), "comment" | "html_interpolation") {
        // RuntimeTrans accepts static markup slots as well as callback slots.
        // Copying html_interpolation with Span::from_node keeps its braces, so
        // the emitted slot content remains valid Astro markup.
        push_original_anchor(
            &mut rendered,
            &indexed_source,
            &format!("<fragment slot=\"{slot_name}\">"),
            node.start_byte(),
        );
        push_copied_span(&mut rendered, input, Span::from_node(node))?;
        push_original_anchor(
            &mut rendered,
            &indexed_source,
            "</fragment>",
            node.end_byte(),
        );
        return rendered.into_rendered().map_err(Into::into);
    }

    push_original_anchor(
        &mut rendered,
        &indexed_source,
        &format!("<fragment slot=\"{slot_name}\">{{(children) => "),
        node.start_byte(),
    );

    if has_content_hole && runtime_warning_mode == RuntimeWarningMode::On {
        rendered.push_unmapped_dynamic(
            "(children !== \"\" && console.warn(\"[lingui-for-astro] <Trans> wrapper with content directives ignores translated children and uses its own content source instead.\"), ",
        );
    }

    match node.kind() {
        "element" => {
            if is_fragment_wrapper(node) {
                rendered.push_unmapped("<Fragment set:html={children} />");
                push_original_anchor(
                    &mut rendered,
                    &indexed_source,
                    "}</fragment>",
                    node.end_byte(),
                );
                return rendered.into_rendered().map_err(Into::into);
            }

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
            if has_content_hole {
                append_copied_wrapper_with_content_hole_anchors(
                    &mut rendered,
                    input,
                    &indexed_source,
                    start_tag,
                    node,
                )?;
            } else {
                push_copied_span(
                    &mut rendered,
                    input,
                    indexed_source.span(node.start_byte(), content_start)?,
                )?;
                rendered.push_unmapped("<Fragment set:html={children} />");
                push_copied_span(
                    &mut rendered,
                    input,
                    indexed_source.span(content_end, node.end_byte())?,
                )?;
            }
        }
        "self_closing_tag" => {
            let _ = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "tag_name")
                .ok_or(AstroAdapterError::MissingTagNameWhileLoweringAstroSlotCallback)?;
            append_copied_wrapper_with_content_hole_anchors(
                &mut rendered,
                input,
                &indexed_source,
                node,
                node,
            )?;
        }
        _ => return Err(RuntimeComponentError::ExpectedJsxElementDescriptor.into()),
    }

    if has_content_hole && runtime_warning_mode == RuntimeWarningMode::On {
        rendered.push_unmapped(")");
    }
    push_original_anchor(
        &mut rendered,
        &indexed_source,
        "}</fragment>",
        node.end_byte(),
    );
    rendered.into_rendered().map_err(Into::into)
}

fn has_content_hole(source: &str, node: Node<'_>) -> bool {
    let tag = match node.kind() {
        "element" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "start_tag"),
        "self_closing_tag" => Some(node),
        _ => None,
    };
    let Some(tag) = tag else {
        return false;
    };

    !find_content_hole_attributes(source, tag).is_empty()
}

fn append_copied_wrapper_with_content_hole_anchors<'a>(
    rendered: &mut MappedText<'a>,
    input: &MappedText<'a>,
    source: &IndexedText<'_>,
    start_tag: Node<'_>,
    wrapper_node: Node<'_>,
) -> Result<(), AstroAdapterError> {
    let attributes = find_content_hole_attributes(source.text(), start_tag);
    if attributes.is_empty() {
        push_copied_span(rendered, input, Span::from_node(wrapper_node))?;
        return Ok(());
    }

    let mut cursor = wrapper_node.start_byte();
    for attribute in attributes {
        if cursor < attribute.start_byte() {
            push_copied_span(
                rendered,
                input,
                source.span(cursor, attribute.start_byte())?,
            )?;
        }
        append_copied_content_hole_attribute(rendered, input, source, attribute)?;
        cursor = attribute.end_byte();
    }

    if cursor < wrapper_node.end_byte() {
        push_copied_span(
            rendered,
            input,
            source.span(cursor, wrapper_node.end_byte())?,
        )?;
    }

    Ok(())
}

fn append_copied_content_hole_attribute<'a>(
    rendered: &mut MappedText<'a>,
    input: &MappedText<'a>,
    source: &IndexedText<'_>,
    attribute: Node<'_>,
) -> Result<(), AstroAdapterError> {
    let Some(name) = attribute
        .children(&mut attribute.walk())
        .find(|child| child.kind() == "attribute_name")
    else {
        push_copied_span(rendered, input, Span::from_node(attribute))?;
        return Ok(());
    };

    if attribute.start_byte() < name.start_byte() {
        push_copied_span(
            rendered,
            input,
            source.span(attribute.start_byte(), name.start_byte())?,
        )?;
    }
    push_original_span(
        rendered,
        source,
        source.span(name.start_byte(), attribute.end_byte())?,
    );
    Ok(())
}

fn find_content_hole_attributes<'a>(source: &'a str, tag: Node<'a>) -> Vec<Node<'a>> {
    let mut cursor = tag.walk();
    tag.children(&mut cursor)
        .filter(|child| child.kind() == "attribute")
        .filter(|attribute| {
            attribute
                .children(&mut attribute.walk())
                .find(|grandchild| grandchild.kind() == "attribute_name")
                .is_some_and(|name| matches!(node_text(source, name), "set:html" | "set:text"))
                && attribute.children(&mut attribute.walk()).any(|child| {
                    matches!(
                        child.kind(),
                        "quoted_attribute_value" | "attribute_interpolation"
                    )
                })
        })
        .collect()
}

fn push_original_anchor(
    rendered: &mut MappedText<'_>,
    source: &IndexedText<'_>,
    text: &str,
    original_byte: usize,
) {
    rendered.push(
        text,
        build_span_anchor_map(
            rendered.source_name(),
            source,
            text,
            original_byte,
            original_byte,
        ),
    );
}

fn push_original_span(rendered: &mut MappedText<'_>, source: &IndexedText<'_>, span: Span) {
    let text = span_text(source.text(), span);
    rendered.push(
        text,
        build_span_anchor_map(rendered.source_name(), source, text, span.start, span.end),
    );
}

#[cfg(test)]
mod tests {
    use indoc::indoc;
    use lean_string::LeanString;

    use crate::common::{RenderedMappedText, Span};
    use crate::framework::MacroFlavor;
    use crate::framework::astro::components::collect_runtime_component_wrapper_spans;
    use crate::syntax::parse::parse_astro;
    use crate::synthesis::NormalizedSegment;
    use crate::transform::runtime_component::find_node_by_span;
    use crate::transform::{
        RuntimeWarningMode, TransformTarget, TransformTargetContext, TransformTargetOutputKind,
        TransformTranslationMode,
    };

    use super::lower_runtime_component_markup;

    fn ls(text: &str) -> LeanString {
        LeanString::from(text)
    }

    fn component_target(source: &LeanString) -> TransformTarget {
        let tree = parse_astro(source).expect("astro source parses");
        let node = find_node_by_span(tree.root_node(), Span::new_unchecked(0, source.len()))
            .expect("component node exists");
        TransformTarget {
            declaration_id: ls("__trans"),
            original_span: Span::new_unchecked(0, source.len()),
            normalized_span: Span::new_unchecked(0, source.len()),
            source_map_anchor: None,
            local_name: ls("Trans"),
            imported_name: ls("Trans"),
            flavor: MacroFlavor::Direct,
            context: TransformTargetContext::Template,
            output_kind: TransformTargetOutputKind::Component,
            translation_mode: TransformTranslationMode::Contextual,
            normalized_segments: Vec::<NormalizedSegment>::new(),
            runtime_component_wrapper_spans: collect_runtime_component_wrapper_spans(
                source, node, "Trans",
            ),
        }
    }

    #[test]
    fn lowers_components_to_named_slot_callbacks() {
        let source = ls("<Trans>Read the <a href=\"/docs\">docs</a>.</Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read the <0>docs</0>.\", components: { 0: <a href=\"/docs\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4aRuntimeTrans placeholders={["0"]} {...(/*i18n*/ {
                  id: "demo.docs",
                  message: "Read the <0>docs</0>."
                })}>
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
                .into();
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read <0><1>carefully</1></0>.\", components: { 0: <strong />, 1: <DocLink href=\"/docs\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4aRuntimeTrans placeholders={["0", "1"]} {...(/*i18n*/ {
                  id: "demo.docs",
                  message: "Read <0><1>carefully</1></0>."
                })}>
                <fragment slot="component_0">{(children) => <strong><Fragment set:html={children} /></strong>}</fragment>
                <fragment slot="component_1">{(children) => <DocLink href="/docs"><Fragment set:html={children} /></DocLink>}</fragment>
                </L4aRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn lowers_fragment_wrappers_from_stored_original_spans() {
        let source = ls("<Trans>{<><strong>Alpha</strong></>}<em>Beta</em></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"<0><1>Alpha</1></0><2>Beta</2>\", components: { 0: <Fragment />, 1: <strong />, 2: <em /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro runtime component lowering succeeds");

        assert!(lowered.code.contains(
            "<fragment slot=\"component_0\">{(children) => <Fragment set:html={children} />}</fragment>"
        ));
        assert!(lowered.code.contains(
            "<fragment slot=\"component_1\">{(children) => <strong><Fragment set:html={children} /></strong>}</fragment>"
        ));
        assert!(lowered.code.contains(
            "<fragment slot=\"component_2\">{(children) => <em><Fragment set:html={children} /></em>}</fragment>"
        ));
    }

    #[test]
    fn rejects_unsafe_placeholder_keys() {
        let source = ls("<Trans>Read the <a href=\"/docs\">docs</a>.</Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read the <0>docs</0>.\", components: { \"bad-key\": <a href=\"/docs\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let error = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect_err("unsafe placeholder key should be rejected");

        assert!(error.to_string().contains(
            "runtime component placeholder key contains unsupported characters: bad-key"
        ));
    }

    #[test]
    fn lowers_set_html_wrappers_to_children_html_holes() {
        let source = ls("<Trans><article set:html={content} /></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.html\", message: \"<0/>\", components: { 0: <article set:html={content} /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro html-hole lowering succeeds");

        assert!(lowered.code.contains(
            "<fragment slot=\"component_0\">{(children) => (children !== \"\" && console.warn("
        ));
        assert!(lowered.code.contains("<article set:html={content} />"));
    }

    #[test]
    fn lowers_set_text_wrappers_to_children_text_holes() {
        let source = ls("<Trans><article set:text={content} /></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.text\", message: \"<0/>\", components: { 0: <article set:text={content} /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro text-hole lowering succeeds");

        assert!(lowered.code.contains(
            "<fragment slot=\"component_0\">{(children) => (children !== \"\" && console.warn("
        ));
        assert!(lowered.code.contains("<article set:text={content} />"));
    }

    #[test]
    fn rewrites_quoted_set_html_and_set_text_values_to_expressions() {
        let html_source = ls("<Trans><article set:html=\"fallback\" /></Trans>");
        let html_declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.html\", message: \"<0/>\", components: { 0: <article set:html=\"fallback\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let html_target = component_target(&html_source);
        let html_lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &html_source,
            &html_target,
            &html_declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro html-hole lowering succeeds");

        assert!(
            html_lowered
                .code
                .contains("<article set:html=\"fallback\" />")
        );

        let text_source = ls("<Trans><article set:text=\"fallback\" /></Trans>");
        let text_declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.text\", message: \"<0/>\", components: { 0: <article set:text=\"fallback\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let text_target = component_target(&text_source);
        let text_lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &text_source,
            &text_target,
            &text_declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro text-hole lowering succeeds");

        assert!(
            text_lowered
                .code
                .contains("<article set:text=\"fallback\" />")
        );
    }

    #[test]
    fn warns_in_dev_when_set_html_wrapper_also_has_explicit_children() {
        let source = ls("<Trans><article set:html={content}>Ignored child</article></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.html\", message: \"<0/>\", components: { 0: <article set:html={content}>Ignored child</article> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro html-hole lowering succeeds");

        assert!(lowered.code.contains("children !== \"\" && console.warn("));
        assert!(
            lowered
                .code
                .contains("<article set:html={content}>Ignored child</article>")
        );
    }

    #[test]
    fn prefers_set_html_over_set_text_when_both_are_present() {
        let source = ls("<Trans><article set:html={html} set:text={text} /></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.text\", message: \"<0/>\", components: { 0: <article set:html={html} set:text={text} /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::On,
        )
        .expect("astro html-hole lowering succeeds");

        assert!(
            lowered
                .code
                .contains("<article set:html={html} set:text={text} />")
        );
        assert!(!lowered.code.contains("hole."));
    }

    #[test]
    fn omits_content_override_warning_when_runtime_warning_mode_is_off() {
        let source = ls("<Trans><article set:html={content}>Ignored child</article></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.html\", message: \"<0/>\", components: { 0: <article set:html={content}>Ignored child</article> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.astro"),
            &source,
            &target,
            &declaration,
            ls("L4aRuntimeTrans"),
            RuntimeWarningMode::Off,
        )
        .expect("astro html-hole lowering succeeds");

        assert!(!lowered.code.contains("console.warn("));
        assert!(lowered.code.contains(
            "<fragment slot=\"component_0\">{(children) => <article set:html={content}>Ignored child</article>}</fragment>"
        ));
    }
}
