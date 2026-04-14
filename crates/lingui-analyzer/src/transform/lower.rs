use std::collections::BTreeMap;

use lean_string::LeanString;

use crate::common::{
    CollectDeclarationsError, IndexedSourceMap, RenderedMappedText,
    collect_variable_initializer_declarations, parse_source_map,
};

use super::emit::{
    EmitError, collect_transform_replacements_internal, finish_transform_from_internal_replacements,
};
use super::{
    AdapterError, FinishedTransformInternal, FrameworkTransformPlan, TransformTargetOutputKind,
    TransformTranslationMode, TransformedPrograms,
};

#[derive(thiserror::Error, Debug)]
pub enum LowerError {
    #[error(transparent)]
    Emit(#[from] EmitError),
    #[error(transparent)]
    Adapter(#[from] AdapterError),
    #[error(transparent)]
    CollectDeclarations(#[from] CollectDeclarationsError),
}

pub(crate) fn finish_transform<P: FrameworkTransformPlan>(
    plan: &P,
    source: &LeanString,
    transformed_programs: &TransformedPrograms,
) -> Result<FinishedTransformInternal, LowerError> {
    let lowered_declarations = lower_transformed_declarations(plan, source, transformed_programs)?;
    let replacements =
        collect_transform_replacements_internal(plan, source, &lowered_declarations)?;
    Ok(finish_transform_from_internal_replacements(
        source,
        &plan.common().source_name,
        &plan.common().source_anchors,
        replacements,
    )?)
}

fn lower_transformed_declarations<P: FrameworkTransformPlan>(
    plan: &P,
    source: &LeanString,
    transformed_programs: &TransformedPrograms,
) -> Result<BTreeMap<LeanString, RenderedMappedText>, LowerError> {
    let declaration_sets = collect_transformed_declarations(transformed_programs)?;
    let mut lowered = BTreeMap::new();

    for target in &plan.common().targets {
        let Some(declaration) = declaration_sets
            .get(&target.translation_mode)
            .and_then(|declarations| declarations.get(&target.declaration_id))
            .cloned()
        else {
            continue;
        };

        let declaration = if target.output_kind == TransformTargetOutputKind::Component {
            plan.lower_runtime_component_markup(
                &plan.common().source_name,
                source,
                target,
                &declaration,
            )?
        } else {
            declaration
        };
        lowered.insert(target.declaration_id.clone(), declaration);
    }

    Ok(lowered)
}

fn collect_transformed_declarations(
    programs: &TransformedPrograms,
) -> Result<BTreeMap<TransformTranslationMode, BTreeMap<LeanString, RenderedMappedText>>, LowerError>
{
    let mut declarations = BTreeMap::new();
    let lowered_source_map = programs
        .lowered_source_map_json
        .as_deref()
        .and_then(parse_source_map)
        .map(IndexedSourceMap::new);
    let contextual_source_map = programs
        .contextual_source_map_json
        .as_deref()
        .and_then(parse_source_map)
        .map(IndexedSourceMap::new);

    if let Some(code) = &programs.lowered_code {
        declarations.insert(
            TransformTranslationMode::Lowered,
            collect_declarations_from_program(code, lowered_source_map.as_ref())?,
        );
    }
    if let Some(code) = &programs.contextual_code {
        declarations.insert(
            TransformTranslationMode::Contextual,
            collect_declarations_from_program(code, contextual_source_map.as_ref())?,
        );
    }

    Ok(declarations)
}

fn collect_declarations_from_program(
    source: &LeanString,
    indexed_source_map: Option<&IndexedSourceMap>,
) -> Result<BTreeMap<LeanString, RenderedMappedText>, LowerError> {
    collect_variable_initializer_declarations(source, indexed_source_map).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use lean_string::LeanString;

    use crate::common::{ScriptLang, Span};
    use crate::conventions::{
        MacroConventions, MacroPackage, MacroPackageKind, RuntimeBindingSeeds, RuntimeConventions,
        RuntimeExportConventions,
    };
    use crate::transform::adapters::{
        SvelteTransformPlan, SvelteTransformRuntimeBindings, SvelteTransformScriptRegion,
    };
    use crate::{
        CommonTransformPlan, FrameworkConventions, FrameworkKind, MacroFlavor, NormalizedSegment,
        RuntimeRequirements, RuntimeWarningOptions, TransformTarget, TransformTargetContext,
        TransformTargetOutputKind, TransformTranslationMode, TransformedPrograms,
    };

    use super::finish_transform;

    fn ls(text: &str) -> LeanString {
        LeanString::from(text)
    }

    fn test_svelte_conventions() -> FrameworkConventions {
        FrameworkConventions {
            framework: FrameworkKind::Svelte,
            macro_: MacroConventions {
                packages: BTreeMap::from([
                    (
                        MacroPackageKind::Core,
                        MacroPackage {
                            packages: vec![ls("@lingui/core/macro")],
                        },
                    ),
                    (
                        MacroPackageKind::Svelte,
                        MacroPackage {
                            packages: vec![ls("lingui-for-svelte/macro")],
                        },
                    ),
                ]),
            },
            runtime: RuntimeConventions {
                package: ls("lingui-for-svelte/runtime"),
                exports: RuntimeExportConventions {
                    trans: ls("RuntimeTrans"),
                    i18n_accessor: Some(ls("createLinguiAccessors")),
                },
            },
            bindings: RuntimeBindingSeeds {
                i18n_accessor_factory: Some(ls("createLinguiAccessors")),
                context: Some(ls("__l4s_ctx")),
                get_i18n: Some(ls("__l4s_getI18n")),
                translate: Some(ls("__l4s_translate")),
                i18n_instance: None,
                reactive_translation_wrapper: Some(ls(
                    "__lingui_for_svelte_reactive_translation__",
                )),
                eager_translation_wrapper: Some(ls("__lingui_for_svelte_eager_translation__")),
                runtime_trans_component: ls("L4sRuntimeTrans"),
            },
        }
    }

    #[test]
    fn finishes_expression_replacements_with_indented_maps() {
        let plan = SvelteTransformPlan {
            common: CommonTransformPlan {
                source_name: ls("Component.svelte"),
                synthetic_name: ls("Component.svelte?transform"),
                synthetic_source: LeanString::new(),
                synthetic_source_map_json: None,
                source_anchors: Vec::new(),
                synthetic_lang: ScriptLang::Ts,
                conventions: test_svelte_conventions(),
                declaration_ids: vec![ls("__lf_0")],
                targets: vec![TransformTarget {
                    declaration_id: ls("__lf_0"),
                    original_span: Span::new(39, 48),
                    normalized_span: Span::new(40, 48),
                    source_map_anchor: None,
                    local_name: ls("t"),
                    imported_name: ls("t"),
                    flavor: MacroFlavor::Reactive,
                    context: TransformTargetContext::Template,
                    output_kind: TransformTargetOutputKind::Expression,
                    translation_mode: TransformTranslationMode::Contextual,
                    normalized_segments: vec![NormalizedSegment {
                        original_start: 8,
                        generated_start: 0,
                        len: 13,
                    }],
                }],
                import_removals: vec![],
            },
            runtime_requirements: RuntimeRequirements {
                needs_runtime_i18n_binding: true,
                needs_runtime_trans_component: false,
            },
            runtime_warnings: RuntimeWarningOptions::default(),
            runtime_bindings: SvelteTransformRuntimeBindings {
                create_lingui_accessors: ls("createLinguiAccessors"),
                context: ls("__l4s_ctx"),
                get_i18n: ls("__l4s_getI18n"),
                translate: ls("__l4s_translate"),
                reactive_translation_wrapper: ls("__lingui_for_svelte_reactive_translation__"),
                eager_translation_wrapper: ls("__lingui_for_svelte_eager_translation__"),
                trans_component: ls("L4sRuntimeTrans"),
            },
            instance_script: Some(SvelteTransformScriptRegion {
                outer_span: Span::new(0, 30),
                content_span: Span::new(9, 20),
                lang: ScriptLang::Ts,
            }),
            module_script: None,
        };
        let source = ls("<script>\n  let x = 1;\n</script>\n<p>\n  {$t`hello`}\n</p>");
        let transformed = TransformedPrograms {
            contextual_code: Some(ls(
                "const __lf_0 = __l4s_translate({id:\"a\",message:\"hello\"});",
            )),
            ..TransformedPrograms::default()
        };

        let finished = finish_transform(&plan, &source, &transformed).expect("finish succeeds");

        assert!(finished.replacements.len() >= 2);
        assert!(
            finished
                .replacements
                .iter()
                .any(|replacement| replacement.start == 39 && replacement.end == 48)
        );
        assert!(
            finished
                .replacements
                .iter()
                .any(|replacement| replacement.code.contains("createLinguiAccessors"))
        );
    }
}
