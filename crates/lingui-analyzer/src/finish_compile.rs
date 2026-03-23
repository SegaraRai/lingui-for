use std::collections::BTreeMap;

use crate::compile_emit::{collect_compile_replacements, finish_compile_from_replacements};
use crate::component_lowering::lower_svelte_runtime_component_markup;
use crate::{AnalyzerError, CompilePlan, CompileTargetOutputKind, FinishedCompile};

pub fn finish_compile(
    plan: &CompilePlan,
    source: &str,
    transformed_declarations: &BTreeMap<String, String>,
) -> Result<FinishedCompile, AnalyzerError> {
    let lowered_declarations = lower_transformed_declarations(plan, transformed_declarations)?;
    let replacements = collect_compile_replacements(plan, source, &lowered_declarations)?;
    Ok(finish_compile_from_replacements(replacements))
}

fn lower_transformed_declarations(
    plan: &CompilePlan,
    transformed_declarations: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>, AnalyzerError> {
    let runtime_component_name = plan
        .runtime_bindings
        .as_ref()
        .map(|bindings| bindings.trans_component.as_str())
        .unwrap_or("L4sRuntimeTrans");
    let mut lowered = BTreeMap::new();

    for target in &plan.targets {
        let Some(code) = transformed_declarations.get(&target.declaration_id) else {
            continue;
        };

        let finalized = if target.output_kind == CompileTargetOutputKind::Component {
            lower_svelte_runtime_component_markup(code, runtime_component_name)?
        } else {
            code.clone()
        };
        lowered.insert(target.declaration_id.clone(), finalized);
    }

    Ok(lowered)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::{
        CompilePlan, CompileRuntimeBindings, CompileScriptRegion, CompileTarget,
        CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode, MacroFlavor,
        NormalizedSegment, RuntimeRequirements, Span,
    };

    use super::finish_compile;

    #[test]
    fn finishes_expression_replacements_with_indented_maps() {
        let plan = CompilePlan {
            framework: "svelte".to_string(),
            source_name: "Component.svelte".to_string(),
            synthetic_name: "Component.svelte?compile".to_string(),
            synthetic_source: String::new(),
            synthetic_lang: "ts".to_string(),
            declaration_ids: vec!["__lf_0".to_string()],
            targets: vec![CompileTarget {
                declaration_id: "__lf_0".to_string(),
                original_span: Span::new(7, 21),
                normalized_span: Span::new(8, 21),
                source_map_anchor: None,
                local_name: "t".to_string(),
                imported_name: "t".to_string(),
                flavor: MacroFlavor::Reactive,
                context: CompileTargetContext::Template,
                output_kind: CompileTargetOutputKind::Expression,
                translation_mode: CompileTranslationMode::SvelteContext,
                normalized_segments: vec![NormalizedSegment {
                    original_start: 8,
                    generated_start: 0,
                    len: 13,
                }],
            }],
            runtime_requirements: RuntimeRequirements {
                needs_runtime_i18n_binding: true,
                needs_runtime_trans_component: false,
            },
            runtime_bindings: Some(CompileRuntimeBindings {
                create_lingui_accessors: "createLinguiAccessors".to_string(),
                context: "__l4s_ctx".to_string(),
                get_i18n: "__l4s_getI18n".to_string(),
                translate: "__l4s_translate".to_string(),
                trans_component: "L4sRuntimeTrans".to_string(),
            }),
            import_removals: vec![],
            instance_script: Some(CompileScriptRegion {
                outer_span: Span::new(0, 30),
                content_span: Span::new(9, 20),
                lang: "ts".to_string(),
            }),
            module_script: None,
        };
        let source = "<script>\n  let x = 1;\n</script>\n<p>\n  {$t`hello`}\n</p>";
        let transformed = BTreeMap::from([(
            "__lf_0".to_string(),
            "__l4s_translate({id:\"a\",message:\"hello\"})".to_string(),
        )]);

        let finished = finish_compile(&plan, source, &transformed).expect("finish succeeds");

        assert!(finished.replacements.len() >= 2);
        assert!(
            finished
                .replacements
                .iter()
                .any(|replacement| replacement.start == 7 && replacement.end == 21)
        );
        assert!(
            finished
                .replacements
                .iter()
                .any(|replacement| replacement.code.contains("createLinguiAccessors"))
        );
    }
}
