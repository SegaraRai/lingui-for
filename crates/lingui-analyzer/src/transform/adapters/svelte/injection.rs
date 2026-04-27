use lean_string::LeanString;

use crate::common::{IndexedText, Span, build_span_anchor_map, span_text};
use crate::conventions::FrameworkConventions;
use crate::transform::TransformReplacementInternal;

use super::{SvelteAdapterError, SvelteTransformPlan, SvelteTransformRuntimeBindings};

pub(super) fn append_runtime_injection_replacements(
    plan: &SvelteTransformPlan,
    source: &LeanString,
    replacements: &mut Vec<TransformReplacementInternal>,
) -> Result<(), SvelteAdapterError> {
    let indexed_source = IndexedText::new(source);
    let runtime_bindings = &plan.runtime_bindings;

    let needs_lingui_context = plan.runtime_requirements.needs_runtime_i18n_binding;
    let needs_trans_component = plan.runtime_requirements.needs_runtime_trans_component;
    if !needs_lingui_context && !needs_trans_component {
        return Ok(());
    }

    if let Some(instance_script) = &plan.instance_script {
        let original_script_content = span_text(source, instance_script.content_span);
        let injections = create_runtime_binding_insertions(
            original_script_content,
            runtime_bindings,
            needs_lingui_context,
            needs_trans_component,
            &plan.common.conventions,
        )?;
        let insertion_start =
            get_script_insertion_start(source, instance_script.content_span.start);

        if !injections.prelude.is_empty() {
            let anchor_span = plan
                .common
                .import_removals
                .iter()
                .find(|span| {
                    span.start >= insertion_start && span.end <= instance_script.content_span.end
                })
                .copied()
                .unwrap_or(Span::new_unchecked(insertion_start, insertion_start));
            let prelude = injections.prelude;
            let source_map = build_span_anchor_map(
                plan.common.source_name.as_str(),
                &indexed_source,
                prelude.as_str(),
                anchor_span.start,
                anchor_span.end,
            );
            replacements.push(TransformReplacementInternal::new(
                LeanString::from_static_str("__runtime_prelude"),
                insertion_start,
                insertion_start,
                prelude,
                source_map,
                Vec::new(),
            ));
        }

        if !injections.suffix.is_empty() {
            replacements.push(TransformReplacementInternal::new(
                LeanString::from_static_str("__runtime_suffix"),
                instance_script.content_span.end,
                instance_script.content_span.end,
                injections.suffix,
                None,
                Vec::new(),
            ));
        }

        return Ok(());
    }

    let injected = create_runtime_binding_insertions(
        "",
        runtime_bindings,
        needs_lingui_context,
        needs_trans_component,
        &plan.common.conventions,
    )?;
    let block = format!("<script>\n{}{}</script>", injected.prelude, injected.suffix);
    let insertion_start = plan
        .module_script
        .as_ref()
        .map(|region| region.outer_span.end)
        .unwrap_or(0);
    let code = if plan.module_script.is_some() {
        LeanString::from(format!("\n\n{block}"))
    } else {
        LeanString::from(format!("{block}\n\n"))
    };

    let source_map = build_span_anchor_map(
        plan.common.source_name.as_str(),
        &indexed_source,
        code.as_str(),
        insertion_start,
        insertion_start,
    );
    replacements.push(TransformReplacementInternal::new(
        LeanString::from_static_str("__runtime_script_block"),
        insertion_start,
        insertion_start,
        code,
        source_map,
        Vec::new(),
    ));
    Ok(())
}

struct RuntimeInsertions {
    prelude: LeanString,
    suffix: LeanString,
}

fn create_runtime_binding_insertions(
    original_script_content: &str,
    runtime_bindings: &SvelteTransformRuntimeBindings,
    include_lingui_context: bool,
    include_trans_component: bool,
    conventions: &FrameworkConventions,
) -> Result<RuntimeInsertions, SvelteAdapterError> {
    let mut prelude = LeanString::new();
    let mut suffix = LeanString::new();
    let runtime_package = conventions.runtime.package.as_str();
    let trans_export = conventions.runtime.exports.trans.as_str();
    let i18n_accessor_export = conventions.runtime.exports.i18n_accessor.as_deref().ok_or(
        SvelteAdapterError::MissingConvention("runtime.exports.i18n_accessor"),
    )?;

    if include_lingui_context && include_trans_component {
        prelude.push_str(&format!(
            "import {{ {} as {}, {} as {} }} from \"{}\";\n",
            trans_export,
            runtime_bindings.trans_component,
            i18n_accessor_export,
            runtime_bindings.create_lingui_accessors,
            runtime_package
        ));
    } else if include_lingui_context {
        prelude.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            i18n_accessor_export, runtime_bindings.create_lingui_accessors, runtime_package
        ));
    } else if include_trans_component {
        prelude.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            trans_export, runtime_bindings.trans_component, runtime_package
        ));
    }

    if include_lingui_context {
        prelude.push_str(&format!(
            "const {} = {}();\nconst {} = {}.getI18n;\nconst {} = {}._;\n",
            runtime_bindings.context,
            runtime_bindings.create_lingui_accessors,
            runtime_bindings.get_i18n,
            runtime_bindings.context,
            runtime_bindings.translate,
            runtime_bindings.context
        ));
        suffix.push_str(&format!("{}.prime();\n", runtime_bindings.context));
    }

    let indent = detect_script_indent(original_script_content);
    Ok(RuntimeInsertions {
        prelude: if prelude.is_empty() {
            LeanString::new()
        } else {
            format_inserted_script(&prelude, &indent, false, false)
        },
        suffix: if suffix.is_empty() {
            LeanString::new()
        } else {
            format_inserted_script(&suffix, &indent, true, false)
        },
    })
}

fn detect_script_indent(content: &str) -> String {
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        return line
            .chars()
            .take_while(|char| matches!(char, ' ' | '\t'))
            .collect();
    }
    String::new()
}

fn get_script_insertion_start(source: &str, content_start: usize) -> usize {
    match (
        source.as_bytes().get(content_start),
        source.as_bytes().get(content_start + 1),
    ) {
        (Some(b'\r'), Some(b'\n')) => content_start + 2,
        (Some(b'\n'), _) => content_start + 1,
        _ => content_start,
    }
}

fn format_inserted_script(
    code: &str,
    indent: &str,
    leading_newline: bool,
    trailing_blank_line: bool,
) -> LeanString {
    let body = code
        .trim_end_matches('\n')
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                line.to_string()
            } else {
                format!("{indent}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let leading = if leading_newline { "\n" } else { "" };
    let trailing = if trailing_blank_line { "\n\n" } else { "\n" };
    LeanString::from(format!("{leading}{body}{trailing}"))
}
