use std::collections::BTreeSet;

use crate::common::{
    EmbeddedScriptRegion, IndexedText, MappedText, RenderedMappedText, ScriptLang, Span,
    build_copy_map, build_span_anchor_map,
};
use crate::compile::{
    CompileTarget, CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype,
    CompileTranslationMode, RuntimeRequirements,
};
use crate::conventions::FrameworkConventions;
use crate::framework::helpers::text::find_pattern_near_start;
use crate::framework::svelte::SvelteAdapter;
use crate::framework::{
    AnalyzeOptions, FrameworkAdapter, MacroCandidateKind, MacroFlavor, WhitespaceMode,
};

use super::super::CommonFrameworkCompileAnalysis;
use super::{
    SvelteAdapterError, SvelteCompileRuntimeBindings, SvelteCompileScriptRegion,
    SvelteFrameworkCompileAnalysis, validate_compile_targets,
};

pub(crate) fn analyze_svelte_compile(
    source: &str,
    source_name: &str,
    whitespace: WhitespaceMode,
    conventions: &FrameworkConventions,
) -> Result<SvelteFrameworkCompileAnalysis, SvelteAdapterError> {
    let analysis = SvelteAdapter.analyze(
        source,
        &AnalyzeOptions {
            source_name: source_name.to_string(),
            whitespace,
            conventions: conventions.clone(),
        },
    )?;
    let imports = analysis
        .scripts
        .iter()
        .flat_map(|script| script.macro_imports.iter().cloned())
        .collect::<Vec<_>>();
    let import_removals = analysis
        .scripts
        .iter()
        .flat_map(|script| script.macro_import_statement_spans.iter().copied())
        .collect::<Vec<_>>();
    let instance_script = analysis
        .scripts
        .iter()
        .find(|script| !script.is_module)
        .map(|script| compile_script_region(&script.region, script.is_typescript));
    let module_script = analysis
        .scripts
        .iter()
        .find(|script| script.is_module)
        .map(|script| compile_script_region(&script.region, script.is_typescript));
    let mut prototypes = Vec::new();

    for script in &analysis.scripts {
        let context = if script.is_module {
            CompileTargetContext::ModuleScript
        } else {
            CompileTargetContext::InstanceScript
        };
        let translation_mode = if script.is_module {
            CompileTranslationMode::Lowered
        } else {
            CompileTranslationMode::Contextual
        };

        prototypes.extend(script.candidates.iter().cloned().map(|candidate| {
            CompileTargetPrototype {
                output_kind: classify_output_kind(candidate.kind),
                candidate,
                context,
                translation_mode,
            }
        }));
    }

    for expression in &analysis.template_expressions {
        prototypes.extend(expression.candidates.iter().cloned().map(|candidate| {
            CompileTargetPrototype {
                output_kind: CompileTargetOutputKind::Expression,
                candidate,
                context: CompileTargetContext::Template,
                translation_mode: CompileTranslationMode::Contextual,
            }
        }));
    }

    prototypes.extend(
        analysis
            .template_components
            .iter()
            .cloned()
            .map(|component| CompileTargetPrototype {
                output_kind: CompileTargetOutputKind::Component,
                candidate: component.candidate,
                context: CompileTargetContext::Template,
                translation_mode: CompileTranslationMode::Contextual,
            }),
    );

    validate_compile_targets(source_name, source, &prototypes)?;

    Ok(SvelteFrameworkCompileAnalysis {
        common: CommonFrameworkCompileAnalysis {
            imports,
            prototypes,
            import_removals,
            synthetic_lang: instance_script
                .as_ref()
                .map(|script| script.lang)
                .or_else(|| module_script.as_ref().map(|script| script.lang))
                .unwrap_or(ScriptLang::Ts),
            source_anchors: analysis.source_anchors.clone(),
        },
        conventions: conventions.clone(),
        runtime_bindings: create_runtime_bindings(
            analysis
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

pub(crate) fn classify_output_kind(kind: MacroCandidateKind) -> CompileTargetOutputKind {
    match kind {
        MacroCandidateKind::Component => CompileTargetOutputKind::Component,
        MacroCandidateKind::CallExpression | MacroCandidateKind::TaggedTemplateExpression => {
            CompileTargetOutputKind::Expression
        }
    }
}

pub(crate) fn compile_script_region(
    region: &EmbeddedScriptRegion,
    is_typescript: bool,
) -> SvelteCompileScriptRegion {
    SvelteCompileScriptRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        lang: if is_typescript {
            ScriptLang::Ts
        } else {
            ScriptLang::Js
        },
    }
}

pub(crate) fn wrap_compile_source(
    analysis: &SvelteFrameworkCompileAnalysis,
    prototype: &CompileTargetPrototype,
    normalized_source: &str,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    let indexed_source = IndexedText::new(normalized_source);
    let mut mapped = MappedText::new("__normalized", normalized_source);
    if prototype.output_kind == CompileTargetOutputKind::Expression {
        match prototype.candidate.flavor {
            MacroFlavor::Reactive => {
                let wrapper = analysis
                    .conventions
                    .wrappers
                    .as_ref()
                    .and_then(|wrappers| wrappers.reactive_translation.as_deref())
                    .ok_or(SvelteAdapterError::MissingConvention(
                        "wrappers.reactive_translation",
                    ))?;
                push_wrapper_anchor(&mut mapped, &indexed_source, &format!("{wrapper}("), 0);
                push_wrapped_copy(
                    &mut mapped,
                    &indexed_source,
                    Span::new(0, normalized_source.len()),
                );
                push_wrapper_anchor(
                    &mut mapped,
                    &indexed_source,
                    &format!(", {:?})", prototype.candidate.local_name),
                    normalized_source.len(),
                );
                return mapped.into_rendered().map_err(SvelteAdapterError::from);
            }
            MacroFlavor::Eager => {
                let wrapper = analysis
                    .conventions
                    .wrappers
                    .as_ref()
                    .and_then(|wrappers| wrappers.eager_translation.as_deref())
                    .ok_or(SvelteAdapterError::MissingConvention(
                        "wrappers.eager_translation",
                    ))?;
                push_wrapper_anchor(&mut mapped, &indexed_source, &format!("{wrapper}("), 0);
                push_wrapped_copy(
                    &mut mapped,
                    &indexed_source,
                    Span::new(0, normalized_source.len()),
                );
                push_wrapper_anchor(&mut mapped, &indexed_source, ")", normalized_source.len());
                return mapped.into_rendered().map_err(SvelteAdapterError::from);
            }
            MacroFlavor::Direct => {}
        }
    }

    push_wrapped_copy(
        &mut mapped,
        &indexed_source,
        Span::new(0, normalized_source.len()),
    );
    mapped.into_rendered().map_err(SvelteAdapterError::from)
}

fn push_wrapper_anchor(
    mapped: &mut MappedText<'_>,
    normalized_source: &IndexedText<'_>,
    text: &str,
    original_byte: usize,
) {
    let Some(map) = build_span_anchor_map(
        "__normalized",
        normalized_source,
        text,
        original_byte,
        original_byte,
    ) else {
        return;
    };
    mapped.push_pre_mapped(text, map);
}

fn push_wrapped_copy(mapped: &mut MappedText<'_>, normalized_source: &IndexedText<'_>, span: Span) {
    if let Some(map) = build_copy_map("__normalized", normalized_source, span, &[]) {
        mapped.push_pre_mapped(&normalized_source.as_str()[span.start..span.end], map);
    } else {
        mapped.push_unmapped(&normalized_source.as_str()[span.start..span.end]);
    }
}

pub(crate) fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: targets.iter().any(|target| {
            target.translation_mode == CompileTranslationMode::Contextual
                && target.output_kind == CompileTargetOutputKind::Expression
                && !matches!(target.imported_name.as_str(), "msg" | "defineMessage")
        }),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == CompileTargetOutputKind::Component),
    }
}

pub(crate) fn create_runtime_bindings(
    declared_names: &[String],
    conventions: &FrameworkConventions,
) -> Result<SvelteCompileRuntimeBindings, SvelteAdapterError> {
    let mut used = declared_names.iter().cloned().collect::<BTreeSet<_>>();
    let bindings = &conventions.bindings;

    Ok(SvelteCompileRuntimeBindings {
        create_lingui_accessors: allocate_unique_binding_name(
            &mut used,
            bindings.i18n_accessor_factory.as_deref().ok_or(
                SvelteAdapterError::MissingConvention("bindings.i18n_accessor_factory"),
            )?,
        ),
        context: allocate_unique_binding_name(
            &mut used,
            bindings
                .context
                .as_deref()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.context"))?,
        ),
        get_i18n: allocate_unique_binding_name(
            &mut used,
            bindings
                .get_i18n
                .as_deref()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.get_i18n"))?,
        ),
        translate: allocate_unique_binding_name(
            &mut used,
            bindings
                .translate
                .as_deref()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.translate"))?,
        ),
        trans_component: allocate_unique_binding_name(
            &mut used,
            bindings.runtime_trans_component.as_str(),
        ),
    })
}

fn allocate_unique_binding_name(used: &mut BTreeSet<String>, preferred: &str) -> String {
    if used.insert(preferred.to_string()) {
        return preferred.to_string();
    }

    let mut index = 1usize;
    loop {
        let candidate = format!("{preferred}_{index}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}

pub(crate) fn repair_compile_targets(source: &str, targets: &mut [CompileTarget]) {
    for target in targets {
        match target.flavor {
            MacroFlavor::Reactive => {
                let pattern = format!("${}", target.local_name);
                let Some(start) = find_pattern_near_start(
                    source,
                    target.original_span.start,
                    target.original_span.end,
                    &pattern,
                ) else {
                    continue;
                };
                if start >= target.original_span.start {
                    continue;
                }

                target.original_span = Span::new(start, target.original_span.end);
                target.normalized_span = target.original_span;
                target.source_map_anchor = Some(Span::new(start + 1, start + pattern.len()));
                if let Some(first) = target.normalized_segments.first_mut() {
                    first.original_start = start + 1;
                }
            }
            MacroFlavor::Eager => {
                let pattern = format!("{}.eager", target.local_name);
                let Some(start) = find_pattern_near_start(
                    source,
                    target.original_span.start,
                    target.original_span.end,
                    &pattern,
                ) else {
                    continue;
                };
                if start >= target.original_span.start {
                    continue;
                }

                target.original_span = Span::new(start, target.original_span.end);
                target.normalized_span = Span::new(start, target.normalized_span.end);
                target.source_map_anchor = Some(Span::new(start, start + target.local_name.len()));
                if let Some(first) = target.normalized_segments.first_mut() {
                    first.original_start = start;
                }
            }
            MacroFlavor::Direct => {}
        }
    }
}
