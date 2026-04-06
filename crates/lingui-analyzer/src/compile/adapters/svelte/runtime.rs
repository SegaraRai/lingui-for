use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{
    IndexedSourceMap, IndexedText, MappedText, RenderedMappedText, Span, build_span_anchor_map,
    node_text,
};
use crate::compile::runtime_component::{
    RuntimeComponentError, append_rendered, convert_jsx_named_attribute, copy_node, copy_span,
    find_first_named_descendant, find_node_by_span, first_named_child, jsx_attribute_name_node,
    jsx_attribute_value_node, key_name, lowerable_object_expression_node, push_anchor_mapped,
    push_copied_span, source_slice, spread_argument_node, spread_element_node, spread_prefix_start,
    translated_span, validate_runtime_placeholder_key,
};
use crate::compile::{CompileTarget, RuntimeWarningMode};
use crate::syntax::parse::{parse_svelte, parse_tsx};

use super::SvelteAdapterError;

struct SvelteLoweredObjectExpression {
    props: RenderedMappedText,
    snippets: Vec<RenderedMappedText>,
}

struct SvelteRuntimeLoweringContext<'a> {
    original_source: &'a IndexedText<'a>,
    declaration_source_map: Option<&'a IndexedSourceMap>,
    source: &'a IndexedText<'a>,
    input: &'a MappedText<'a>,
    original_input: MappedText<'a>,
    target: &'a CompileTarget,
    runtime_component_name: &'a str,
}

pub(crate) fn lower_runtime_component_markup(
    source_name: &LeanString,
    original_source: &LeanString,
    target: &CompileTarget,
    declaration: &RenderedMappedText,
    runtime_component_name: &str,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    let declaration_source = IndexedText::new(&declaration.code);
    let original_source = IndexedText::new(original_source);
    let mapped_input = MappedText::from_rendered(
        source_name,
        original_source.text(),
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
        original_source.text(),
        original_source.text(),
        None,
    );
    let context = SvelteRuntimeLoweringContext {
        original_source: &original_source,
        declaration_source_map: declaration.indexed_source_map.as_ref(),
        source: &declaration_source,
        input: &mapped_input,
        original_input,
        target,
        runtime_component_name,
    };

    convert_runtime_trans_root(
        &context,
        value,
        -(wrapper_prefix.len() as isize),
        runtime_warning_mode,
    )
}

fn convert_runtime_trans_root(
    context: &SvelteRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or(RuntimeComponentError::ExpectedJsxElementInitializerForTransformedComponent)?;

    let mut mapped = context.input.empty_like();
    let root_span = translated_span(node, base_offset)?;
    let mut snippets = Vec::new();

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
                    let lowered = lower_object_expression_node(
                        context,
                        object,
                        base_offset,
                        0,
                        runtime_warning_mode,
                    )?;
                    mapped.push_unmapped(" {...");
                    let prefix_start =
                        spread_prefix_start(context.source.text(), spread_span, object_span)?;
                    let prefix_trimmed_start = context.source.text()
                        [prefix_start..object_span.start]
                        .find(|char: char| !char.is_ascii_whitespace())
                        .map(|offset| prefix_start + offset);
                    if let Some(prefix_trimmed_start) = prefix_trimmed_start {
                        push_copied_span(
                            &mut mapped,
                            context.input,
                            Span::new(prefix_trimmed_start, object_span.start),
                        )?;
                    }
                    append_rendered(&mut mapped, lowered.props);
                    let suffix_trimmed_end = context.source.text()
                        [object_span.end..spread_span.end]
                        .rfind(|char: char| !char.is_ascii_whitespace())
                        .map(|offset| object_span.end + offset + 1);
                    if let Some(suffix_trimmed_end) = suffix_trimmed_end {
                        push_copied_span(
                            &mut mapped,
                            context.input,
                            Span::new(object_span.end, suffix_trimmed_end),
                        )?;
                    }
                    mapped.push_unmapped("}");
                    snippets.extend(lowered.snippets);
                    continue;
                }

                mapped.push_unmapped(" ");
                push_copied_span(
                    &mut mapped,
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
                    && let Some(component_snippets) = collect_component_snippets(
                        &context.original_input,
                        context.original_source.text(),
                        context.target,
                        context.source.text(),
                        expression,
                        base_offset,
                        runtime_warning_mode,
                    )?
                {
                    snippets.extend(component_snippets);
                    continue;
                }

                append_rendered(
                    &mut mapped,
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

    if snippets.is_empty() {
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
        for snippet in snippets {
            append_rendered(&mut mapped, snippet);
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

    mapped.into_rendered().map_err(SvelteAdapterError::from)
}

fn lower_object_expression_node(
    context: &SvelteRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<SvelteLoweredObjectExpression, SvelteAdapterError> {
    let object = lowerable_object_expression_node(node).unwrap_or(node);
    if object.kind() != "object" {
        let span = translated_span(node, base_offset)?;
        return Ok(SvelteLoweredObjectExpression {
            props: copy_span(context.input, span)?,
            snippets: Vec::new(),
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
    context: &SvelteRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<SvelteLoweredObjectExpression, SvelteAdapterError> {
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut rendered = context.input.empty_like();
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
                let key_name = key_name(context.source.text(), key, base_offset);
                if key_name == Some("components")
                    && let Some(component_snippets) = collect_component_snippets(
                        &context.original_input,
                        context.original_source.text(),
                        context.target,
                        context.source.text(),
                        value,
                        base_offset,
                        runtime_warning_mode,
                    )?
                {
                    snippets.extend(component_snippets);
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

    Ok(SvelteLoweredObjectExpression {
        props: rendered.into_rendered().map_err(SvelteAdapterError::from)?,
        snippets,
    })
}

fn convert_expression_for_runtime_trans(
    context: &SvelteRuntimeLoweringContext<'_>,
    node: Node<'_>,
    base_offset: isize,
    indent_level: usize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    match node.kind() {
        "object" => convert_object_expression(
            context,
            node,
            base_offset,
            indent_level,
            runtime_warning_mode,
        )
        .map(|lowered| lowered.props),
        _ => Ok(copy_node(
            context.source.text(),
            context.input,
            node,
            base_offset,
        )?),
    }
}

fn collect_component_snippets(
    original_input: &MappedText<'_>,
    original_source: &LeanString,
    target: &CompileTarget,
    transformed_source: &LeanString,
    node: Node<'_>,
    base_offset: isize,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<Option<Vec<RenderedMappedText>>, SvelteAdapterError> {
    if node.kind() != "object" {
        return Err(
            RuntimeComponentError::ExpectedObjectExpressionForRuntimeTransComponents.into(),
        );
    }

    let mut keys = Vec::new();
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
        keys.push(LeanString::from(validate_runtime_placeholder_key(
            key_name,
        )?));
    }

    Ok(Some(collect_component_snippets_from_source(
        original_input,
        original_source,
        target,
        &keys,
        runtime_warning_mode,
    )?))
}

fn collect_component_snippets_from_source(
    original_input: &MappedText<'_>,
    original_source: &LeanString,
    target: &CompileTarget,
    keys: &[LeanString],
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<Vec<RenderedMappedText>, SvelteAdapterError> {
    let tree = parse_svelte(original_source)?;
    let root = tree.root_node();
    let component_node = find_node_by_span(root, target.original_span)
        .ok_or(SvelteAdapterError::MissingOriginalSvelteTransNode)?;
    let mut wrappers = Vec::new();
    collect_runtime_component_wrappers(component_node, original_source, &mut wrappers);

    if wrappers.len() != keys.len() {
        return Err(
            SvelteAdapterError::MismatchedSvelteRuntimeComponentPlaceholderCount {
                expected: keys.len(),
                found: wrappers.len(),
            },
        );
    }

    keys.iter()
        .zip(wrappers)
        .map(|(key, wrapper)| {
            lower_original_wrapper_to_snippet(
                original_input,
                original_source,
                wrapper,
                &format!("component_{key}"),
                runtime_warning_mode,
            )
        })
        .collect()
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
            "html_tag" | "render_tag" => {
                wrappers.push(child);
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
            .map(|tag_name| node_text(source, tag_name)),
        "self_closing_tag" => node
            .children(&mut node.walk())
            .find(|child| child.kind() == "tag_name")
            .map(|tag_name| node_text(source, tag_name)),
        _ => None,
    }
}

fn lower_original_wrapper_to_snippet(
    input: &MappedText<'_>,
    source: &LeanString,
    node: Node<'_>,
    snippet_name: &str,
    runtime_warning_mode: RuntimeWarningMode,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    let indexed_source = IndexedText::new(source);
    let mut rendered = input.empty_like();
    push_original_anchor(
        &mut rendered,
        &indexed_source,
        &format!("{{#snippet {snippet_name}(children)}}"),
        node.start_byte(),
    );

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
                .ok_or(SvelteAdapterError::MissingTagNameWhileLoweringSvelteSnippet)?;
            let tag_name_span = Span::from_node(tag_name);
            let self_closing_offset = node_text(source, node)
                .rfind("/>")
                .ok_or(RuntimeComponentError::ExpectedJsxElementDescriptor)?;
            push_copied_span(
                &mut rendered,
                input,
                Span::new(node.start_byte(), node.start_byte() + self_closing_offset),
            )?;
            rendered.push_unmapped(">{@render children?.()}</");
            push_copied_span(&mut rendered, input, tag_name_span)?;
            rendered.push_unmapped(">");
        }
        "html_tag" | "render_tag" => {
            push_runtime_content_override_warning(&mut rendered, runtime_warning_mode);
            push_copied_span(&mut rendered, input, Span::from_node(node))?;
        }
        _ => return Err(RuntimeComponentError::ExpectedJsxElementDescriptor.into()),
    }

    push_original_anchor(
        &mut rendered,
        &indexed_source,
        "{/snippet}",
        node.end_byte(),
    );
    rendered.into_rendered().map_err(SvelteAdapterError::from)
}

fn push_runtime_content_override_warning(
    rendered: &mut MappedText<'_>,
    runtime_warning_mode: RuntimeWarningMode,
) {
    if runtime_warning_mode == RuntimeWarningMode::Off {
        return;
    }
    rendered.push_unmapped("{#if children}{@const __l4s_ignored = console.warn(");
    rendered.push_unmapped("\"[lingui-for-svelte] <Trans> content tags ignore translated children and use their own source instead.\"");
    rendered.push_unmapped(")}{/if}");
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

#[cfg(test)]
mod tests {
    use indoc::indoc;
    use lean_string::LeanString;

    use crate::common::{RenderedMappedText, Span};
    use crate::compile::{
        CompileTarget, CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode,
        RuntimeWarningMode,
    };
    use crate::framework::MacroFlavor;
    use crate::synthesis::NormalizedSegment;

    use super::lower_runtime_component_markup;

    fn ls(text: &str) -> LeanString {
        LeanString::from(text)
    }

    fn component_target(source: &LeanString) -> CompileTarget {
        CompileTarget {
            declaration_id: ls("__trans"),
            original_span: Span::new(0, source.len()),
            normalized_span: Span::new(0, source.len()),
            source_map_anchor: None,
            local_name: ls("Trans"),
            imported_name: ls("Trans"),
            flavor: MacroFlavor::Direct,
            context: CompileTargetContext::Template,
            output_kind: CompileTargetOutputKind::Component,
            translation_mode: CompileTranslationMode::Contextual,
            normalized_segments: Vec::<NormalizedSegment>::new(),
        }
    }

    #[test]
    fn lowers_components_to_implicit_snippets() {
        let source = ls("<Trans>Read the <a href=\"/docs\">docs</a>.</Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"Read the <0>docs</0>.\", components: { 0: <a href=\"/docs\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
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
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
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
    fn lowers_self_closing_source_wrappers_to_open_and_close_tags() {
        let source = ls("<Trans><DocLink href=\"/docs\" /></Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.docs\", message: \"<0>docs</0>\", components: { 0: <DocLink href=\"/docs\" /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
        )
        .expect("svelte runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {.../*i18n*/ {
                  id: "demo.docs",
                  message: "<0>docs</0>"
                }}>
                {#snippet component_0(children)}<DocLink href="/docs" >{@render children?.()}</DocLink>{/snippet}
                </L4sRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn skips_component_macros_inside_runtime_trans_wrappers() {
        let source = ls(indoc! {r##"
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
        .trim());
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.plural\", message: \"You have <0>{count, plural, =0 {no unread messages} one {# unread message} other {# unread messages}}</0>.\", values: { count }, components: { 0: <strong /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
        )
        .expect("svelte runtime component lowering succeeds");

        assert!(lowered.code.contains(
            "{#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}"
        ));
    }

    #[test]
    fn skips_nested_component_macro_wrappers_inside_runtime_trans() {
        let source = ls(indoc! {r##"
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
        .trim());
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.deep\", message: \"Before <0>{count, plural, =0 {{rank, selectordinal, one {{role, select, admin {zero first admin} other {zero first other}}} other {{role, select, admin {zero later admin} other {zero later other}}}} other {fallback}}</0> after.\", values: { count, rank, role }, components: { 0: <strong /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
        )
        .expect("svelte runtime component lowering succeeds");

        assert!(lowered.code.contains(
            "{#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}"
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
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
        )
        .expect_err("unsafe placeholder key should be rejected");

        assert!(error.to_string().contains(
            "runtime component placeholder key contains unsupported characters: bad-key"
        ));
    }

    #[test]
    fn lowers_html_tags_to_source_based_snippets_with_dev_warning() {
        let source = ls("<Trans>{@html content}</Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.html\", message: \"<0/>\", components: { 0: <LinguiForSvelteHtml value={content} /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
        )
        .expect("svelte runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {.../*i18n*/ {
                  id: "demo.html",
                  message: "<0/>"
                }}>
                {#snippet component_0(children)}{#if children}{@const __l4s_ignored = console.warn("[lingui-for-svelte] <Trans> content tags ignore translated children and use their own source instead.")}{/if}{@html content}{/snippet}
                </L4sRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn lowers_render_tags_to_source_based_snippets_with_dev_warning() {
        let source = ls("<Trans>{@render row(item)}</Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.render\", message: \"<0/>\", components: { 0: <LinguiForSvelteRender value={row(item)} /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::On,
        )
        .expect("svelte runtime component lowering succeeds");

        assert_eq!(
            lowered.code,
            indoc! {r#"
                <L4sRuntimeTrans {.../*i18n*/ {
                  id: "demo.render",
                  message: "<0/>"
                }}>
                {#snippet component_0(children)}{#if children}{@const __l4s_ignored = console.warn("[lingui-for-svelte] <Trans> content tags ignore translated children and use their own source instead.")}{/if}{@render row(item)}{/snippet}
                </L4sRuntimeTrans>
            "#}
            .trim_end()
        );
    }

    #[test]
    fn omits_content_override_warning_when_runtime_warning_mode_is_off() {
        let source = ls("<Trans>{@html content}</Trans>");
        let declaration = RenderedMappedText {
            code: ls(
                "<Trans {.../*i18n*/ { id: \"demo.html\", message: \"<0/>\", components: { 0: <LinguiForSvelteHtml value={content} /> } }} />",
            ),
            indexed_source_map: None,
        };
        let target = component_target(&source);

        let lowered = lower_runtime_component_markup(
            &ls("Component.svelte"),
            &source,
            &target,
            &declaration,
            "L4sRuntimeTrans",
            RuntimeWarningMode::Off,
        )
        .expect("svelte runtime component lowering succeeds");

        assert!(!lowered.code.contains("console.warn("));
        assert!(
            lowered
                .code
                .contains("{#snippet component_0(children)}{@html content}{/snippet}")
        );
    }
}
