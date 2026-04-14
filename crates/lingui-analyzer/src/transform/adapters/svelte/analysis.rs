use std::collections::BTreeSet;

use lean_string::LeanString;

use crate::common::{
    EmbeddedScriptRegion, IndexedSourceMap, IndexedText, MappedText, RenderedMappedText,
    ScriptLang, Span, build_copy_map_from_anchors, build_span_anchor_map, span_text,
};
use crate::conventions::FrameworkConventions;
use crate::framework::svelte::SvelteAdapter;
use crate::framework::{
    AnalyzeOptions, FrameworkAdapter, MacroCandidateKind, MacroFlavor, WhitespaceMode,
};
use crate::transform::{
    RuntimeRequirements, TransformTarget, TransformTargetContext, TransformTargetOutputKind,
    TransformTargetPrototype, TransformTranslationMode,
};

use super::super::CommonFrameworkTransformAnalysis;
use super::{
    SvelteAdapterError, SvelteFrameworkTransformAnalysis, SvelteTransformRuntimeBindings,
    SvelteTransformScriptRegion, validate_transform_targets,
};

pub(crate) fn analyze_svelte_transform(
    source: &LeanString,
    source_name: &LeanString,
    whitespace: WhitespaceMode,
    conventions: &FrameworkConventions,
) -> Result<SvelteFrameworkTransformAnalysis, SvelteAdapterError> {
    let analysis = SvelteAdapter.analyze(
        source,
        &AnalyzeOptions {
            source_name: source_name.clone(),
            whitespace,
            conventions: conventions.clone(),
        },
    )?;
    let imports = analysis
        .semantic
        .scripts
        .iter()
        .flat_map(|script| script.macro_imports.iter().cloned())
        .collect::<Vec<_>>();
    let import_removals = analysis
        .semantic
        .scripts
        .iter()
        .flat_map(|script| script.macro_import_statement_spans.iter().copied())
        .collect::<Vec<_>>();
    let instance_script = analysis
        .semantic
        .scripts
        .iter()
        .find(|script| !script.is_module)
        .map(|script| transform_script_region(&script.region, script.is_typescript));
    let module_script = analysis
        .semantic
        .scripts
        .iter()
        .find(|script| script.is_module)
        .map(|script| transform_script_region(&script.region, script.is_typescript));
    let mut prototypes = Vec::new();

    for script in &analysis.semantic.scripts {
        let context = if script.is_module {
            TransformTargetContext::ModuleScript
        } else {
            TransformTargetContext::InstanceScript
        };
        let translation_mode = if script.is_module {
            TransformTranslationMode::Lowered
        } else {
            TransformTranslationMode::Contextual
        };

        prototypes.extend(script.candidates.iter().cloned().map(|candidate| {
            TransformTargetPrototype {
                output_kind: classify_output_kind(candidate.kind),
                candidate,
                context,
                translation_mode,
            }
        }));
    }

    for expression in &analysis.semantic.template_expressions {
        prototypes.extend(expression.candidates.iter().cloned().map(|candidate| {
            TransformTargetPrototype {
                output_kind: TransformTargetOutputKind::Expression,
                candidate,
                context: TransformTargetContext::Template,
                translation_mode: TransformTranslationMode::Contextual,
            }
        }));
    }

    prototypes.extend(
        analysis
            .semantic
            .template_components
            .iter()
            .cloned()
            .map(|component| TransformTargetPrototype {
                output_kind: TransformTargetOutputKind::Component,
                candidate: component.candidate,
                context: TransformTargetContext::Template,
                translation_mode: TransformTranslationMode::Contextual,
            }),
    );

    validate_transform_targets(source_name, source, &prototypes)?;

    Ok(SvelteFrameworkTransformAnalysis {
        common: CommonFrameworkTransformAnalysis {
            imports,
            prototypes,
            import_removals,
            synthetic_lang: instance_script
                .as_ref()
                .map(|script| script.lang)
                .or_else(|| module_script.as_ref().map(|script| script.lang))
                .unwrap_or(ScriptLang::Ts),
            source_anchors: analysis.metadata.source_anchors.clone(),
        },
        runtime_bindings: create_runtime_bindings(
            analysis
                .semantic
                .scripts
                .iter()
                .find(|script| !script.is_module)
                .map(|script| script.declared_names.as_slice())
                .unwrap_or(&[]),
            conventions,
        )?,
        instance_script: instance_script.clone(),
        module_script: module_script.clone(),
    })
}

pub(crate) fn classify_output_kind(kind: MacroCandidateKind) -> TransformTargetOutputKind {
    match kind {
        MacroCandidateKind::Component => TransformTargetOutputKind::Component,
        MacroCandidateKind::CallExpression | MacroCandidateKind::TaggedTemplateExpression => {
            TransformTargetOutputKind::Expression
        }
    }
}

pub(crate) fn transform_script_region(
    region: &EmbeddedScriptRegion,
    is_typescript: bool,
) -> SvelteTransformScriptRegion {
    SvelteTransformScriptRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        lang: if is_typescript {
            ScriptLang::Ts
        } else {
            ScriptLang::Js
        },
    }
}

pub(crate) fn wrap_transform_source(
    analysis: &SvelteFrameworkTransformAnalysis,
    prototype: &TransformTargetPrototype,
    normalized_source: &RenderedMappedText,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    let indexed_source = IndexedText::new(&normalized_source.code);
    let copy_anchors = collect_normalized_copy_anchors(
        &indexed_source,
        normalized_source.indexed_source_map.as_ref(),
    );
    let source_name = LeanString::from_static_str("__normalized");
    let mut mapped = MappedText::new(&source_name, &normalized_source.code);
    if prototype.output_kind == TransformTargetOutputKind::Expression {
        match prototype.candidate.flavor {
            MacroFlavor::Reactive => {
                let wrapper = analysis
                    .runtime_bindings
                    .reactive_translation_wrapper
                    .as_str();
                push_wrapper_anchor(&mut mapped, &indexed_source, &format!("{wrapper}("), 0);
                push_wrapped_copy(
                    &mut mapped,
                    &indexed_source,
                    Span::new(0, normalized_source.code.len()),
                    &copy_anchors,
                );
                push_wrapper_anchor(
                    &mut mapped,
                    &indexed_source,
                    &format!(", {:?})", prototype.candidate.local_name),
                    normalized_source.code.len(),
                );
                return mapped.into_rendered().map_err(SvelteAdapterError::from);
            }
            MacroFlavor::Eager => {
                let wrapper = analysis.runtime_bindings.eager_translation_wrapper.as_str();
                push_wrapper_anchor(&mut mapped, &indexed_source, &format!("{wrapper}("), 0);
                push_wrapped_copy(
                    &mut mapped,
                    &indexed_source,
                    Span::new(0, normalized_source.code.len()),
                    &copy_anchors,
                );
                push_wrapper_anchor(
                    &mut mapped,
                    &indexed_source,
                    ")",
                    normalized_source.code.len(),
                );
                return mapped.into_rendered().map_err(SvelteAdapterError::from);
            }
            MacroFlavor::Direct => {}
        }
    }

    push_wrapped_copy(
        &mut mapped,
        &indexed_source,
        Span::new(0, normalized_source.code.len()),
        &copy_anchors,
    );
    mapped.into_rendered().map_err(SvelteAdapterError::from)
}

fn push_wrapper_anchor(
    mapped: &mut MappedText<'_>,
    normalized_source: &IndexedText<'_>,
    text: &str,
    original_byte: usize,
) {
    mapped.push(
        text,
        build_span_anchor_map(
            "__normalized",
            normalized_source,
            text,
            original_byte,
            original_byte,
        ),
    );
}

fn push_wrapped_copy(
    mapped: &mut MappedText<'_>,
    normalized_source: &IndexedText<'_>,
    span: Span,
    copy_anchors: &[usize],
) {
    mapped.push(
        span_text(normalized_source.text(), span),
        build_copy_map_from_anchors("__normalized", normalized_source, span, copy_anchors),
    );
}

fn collect_normalized_copy_anchors(
    normalized_source: &IndexedText<'_>,
    normalized_map: Option<&IndexedSourceMap>,
) -> Vec<usize> {
    let Some(normalized_map) = normalized_map else {
        return Vec::new();
    };

    normalized_map
        .tokens()
        .iter()
        .filter_map(|token| {
            normalized_source.line_utf16_col_to_byte(
                token.generated_position().0 as usize,
                token.generated_position().1 as usize,
            )
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub(crate) fn compute_runtime_requirements(targets: &[TransformTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: targets.iter().any(|target| {
            target.translation_mode == TransformTranslationMode::Contextual
                && target.output_kind == TransformTargetOutputKind::Expression
                && !matches!(target.imported_name.as_str(), "msg" | "defineMessage")
        }),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == TransformTargetOutputKind::Component),
    }
}

pub(crate) fn create_runtime_bindings(
    declared_names: &[LeanString],
    conventions: &FrameworkConventions,
) -> Result<SvelteTransformRuntimeBindings, SvelteAdapterError> {
    let mut used = declared_names.iter().cloned().collect::<BTreeSet<_>>();
    let bindings = &conventions.bindings;

    Ok(SvelteTransformRuntimeBindings {
        create_lingui_accessors: allocate_unique_binding_name(
            &mut used,
            bindings
                .i18n_accessor_factory
                .clone()
                .ok_or(SvelteAdapterError::MissingConvention(
                    "bindings.i18n_accessor_factory",
                ))?,
        ),
        context: allocate_unique_binding_name(
            &mut used,
            bindings
                .context
                .clone()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.context"))?,
        ),
        get_i18n: allocate_unique_binding_name(
            &mut used,
            bindings
                .get_i18n
                .clone()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.get_i18n"))?,
        ),
        translate: allocate_unique_binding_name(
            &mut used,
            bindings
                .translate
                .clone()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.translate"))?,
        ),
        reactive_translation_wrapper: allocate_unique_binding_name(
            &mut used,
            bindings.reactive_translation_wrapper.clone().ok_or(
                SvelteAdapterError::MissingConvention("bindings.reactive_translation_wrapper"),
            )?,
        ),
        eager_translation_wrapper: allocate_unique_binding_name(
            &mut used,
            bindings.eager_translation_wrapper.clone().ok_or(
                SvelteAdapterError::MissingConvention("bindings.eager_translation_wrapper"),
            )?,
        ),
        trans_component: allocate_unique_binding_name(
            &mut used,
            bindings.runtime_trans_component.clone(),
        ),
    })
}

fn allocate_unique_binding_name(
    used: &mut BTreeSet<LeanString>,
    preferred: LeanString,
) -> LeanString {
    if used.insert(preferred.clone()) {
        return preferred;
    }

    let mut index = 1usize;
    loop {
        let candidate = LeanString::from(format!("{preferred}_{index}"));
        if used.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}
