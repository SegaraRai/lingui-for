use std::collections::BTreeMap;

use crate::common::{
    CollectDeclarationsError, SharedSourceMap, TransformedDeclaration,
    collect_variable_initializer_declarations, initializer_start_for_declarator, parse_source_map,
};
use crate::framework::parse::{ParseError, parse_tsx};

use super::emit::{
    EmitError, collect_compile_replacements_internal, finish_compile_from_internal_replacements,
};
use super::runtime_component::RuntimeComponentError;
use super::{
    CompileTargetOutputKind, CompileTranslationMode, FinishedCompile, FrameworkCompilePlan,
    TransformedPrograms,
};

#[derive(thiserror::Error, Debug)]
pub enum LowerError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Emit(#[from] EmitError),
    #[error(transparent)]
    RuntimeComponent(#[from] RuntimeComponentError),
    #[error(transparent)]
    CollectDeclarations(#[from] CollectDeclarationsError),
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LoweredDeclaration {
    pub(crate) code: String,
    pub(crate) source_map: Option<SharedSourceMap>,
    pub(crate) synthetic_start: Option<usize>,
}

pub(crate) fn finish_compile<P: FrameworkCompilePlan>(
    plan: &P,
    source: &str,
    transformed_programs: &TransformedPrograms,
) -> Result<FinishedCompile, LowerError> {
    let lowered_declarations = lower_transformed_declarations(plan, source, transformed_programs)?;
    let replacements = collect_compile_replacements_internal(plan, source, &lowered_declarations)?;
    Ok(finish_compile_from_internal_replacements(
        source,
        &plan.common().source_name,
        &plan.common().source_anchors,
        replacements,
    )?)
}

fn lower_transformed_declarations<P: FrameworkCompilePlan>(
    plan: &P,
    source: &str,
    transformed_programs: &TransformedPrograms,
) -> Result<BTreeMap<String, LoweredDeclaration>, LowerError> {
    let declaration_sets = collect_transformed_declarations(transformed_programs)?;
    let synthetic_starts = collect_declaration_value_starts(&plan.common().synthetic_source)?;
    let mut lowered = BTreeMap::new();

    for target in &plan.common().targets {
        let Some(declaration) = declaration_sets
            .get(&target.translation_mode)
            .and_then(|declarations| declarations.get(&target.declaration_id))
        else {
            continue;
        };

        let (code, source_map) = if target.output_kind == CompileTargetOutputKind::Component {
            let lowered = plan.lower_runtime_component_markup(
                &plan.common().source_name,
                source,
                crate::common::RenderedMappedText {
                    code: declaration.code.clone(),
                    source_map: declaration.source_map.clone(),
                },
            )?;
            (lowered.code, lowered.source_map)
        } else {
            (declaration.code.clone(), declaration.source_map.clone())
        };
        lowered.insert(
            target.declaration_id.clone(),
            LoweredDeclaration {
                code,
                source_map,
                synthetic_start: declaration
                    .synthetic_start
                    .or_else(|| synthetic_starts.get(&target.declaration_id).copied()),
            },
        );
    }

    Ok(lowered)
}

fn collect_transformed_declarations(
    programs: &TransformedPrograms,
) -> Result<BTreeMap<CompileTranslationMode, BTreeMap<String, LoweredDeclaration>>, LowerError> {
    let mut declarations = BTreeMap::new();
    let raw_source_map = programs
        .raw_source_map_json
        .as_deref()
        .and_then(parse_source_map);
    let context_source_map = programs
        .context_source_map_json
        .as_deref()
        .and_then(parse_source_map);

    if let Some(code) = &programs.raw_code {
        declarations.insert(
            CompileTranslationMode::Raw,
            collect_declarations_from_program(code, raw_source_map.as_ref())?,
        );
    }
    if let Some(code) = &programs.context_code {
        declarations.insert(
            CompileTranslationMode::Context,
            collect_declarations_from_program(code, context_source_map.as_ref())?,
        );
    }

    Ok(declarations)
}

fn collect_declarations_from_program(
    source: &str,
    source_map: Option<&SharedSourceMap>,
) -> Result<BTreeMap<String, LoweredDeclaration>, LowerError> {
    Ok(
        collect_variable_initializer_declarations(source, source_map)?
            .into_iter()
            .map(|(name, declaration): (String, TransformedDeclaration)| {
                (
                    name,
                    LoweredDeclaration {
                        code: declaration.code,
                        source_map: declaration.source_map,
                        synthetic_start: None,
                    },
                )
            })
            .collect(),
    )
}

fn collect_declaration_value_starts(source: &str) -> Result<BTreeMap<String, usize>, LowerError> {
    let tree = parse_tsx(source)?;
    let root = tree.root_node();
    let mut starts = BTreeMap::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        if child.kind() != "variable_declaration" && child.kind() != "lexical_declaration" {
            continue;
        }

        let mut decl_cursor = child.walk();
        for declarator in child.children(&mut decl_cursor) {
            if declarator.kind() != "variable_declarator" {
                continue;
            }

            let Some(name) = declarator.child_by_field_name("name") else {
                continue;
            };
            if name.kind() != "identifier" {
                continue;
            }
            let Some(value) = declarator.child_by_field_name("value") else {
                continue;
            };

            starts.insert(
                source[name.start_byte()..name.end_byte()].to_string(),
                initializer_start_for_declarator(declarator, name, value),
            );
        }
    }

    Ok(starts)
}

#[cfg(test)]
mod tests {
    use crate::{
        CommonCompilePlan, CompileTarget, CompileTargetContext, CompileTargetOutputKind,
        CompileTranslationMode, FrameworkConventions, FrameworkKind, MacroFlavor,
        NormalizedSegment, RuntimeRequirements, TransformedPrograms,
        common::{ScriptLang, Span},
        compile::adapters::{
            SvelteCompilePlan, SvelteCompileRuntimeBindings, SvelteCompileScriptRegion,
        },
        conventions::{
            MacroConventions, RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions,
            SyntheticConventions, WrapperConventions,
        },
    };

    use super::finish_compile;

    fn test_svelte_conventions() -> FrameworkConventions {
        FrameworkConventions {
            framework: FrameworkKind::Svelte,
            macro_: MacroConventions {
                primary_package: "lingui-for-svelte/macro".to_string(),
                accepted_packages: vec![
                    "lingui-for-svelte/macro".to_string(),
                    "@lingui/core/macro".to_string(),
                ],
            },
            runtime: RuntimeConventions {
                package: "lingui-for-svelte/runtime".to_string(),
                exports: RuntimeExportConventions {
                    trans: "RuntimeTrans".to_string(),
                    i18n_accessor: Some("createLinguiAccessors".to_string()),
                },
            },
            bindings: RuntimeBindingSeeds {
                i18n_accessor_factory: Some("createLinguiAccessors".to_string()),
                context: Some("__l4s_ctx".to_string()),
                get_i18n: Some("__l4s_getI18n".to_string()),
                translate: Some("__l4s_translate".to_string()),
                i18n_instance: None,
                runtime_trans_component: "L4sRuntimeTrans".to_string(),
            },
            synthetic: Some(SyntheticConventions {
                expression_prefix: Some("__lingui_for_svelte_expr_".to_string()),
                component_prefix: Some("__lingui_for_svelte_component_".to_string()),
            }),
            wrappers: Some(WrapperConventions {
                reactive_translation: Some(
                    "__lingui_for_svelte_reactive_translation__".to_string(),
                ),
                eager_translation: Some("__lingui_for_svelte_eager_translation__".to_string()),
            }),
        }
    }

    #[test]
    fn finishes_expression_replacements_with_indented_maps() {
        let plan = SvelteCompilePlan {
            common: CommonCompilePlan {
                source_name: "Component.svelte".to_string(),
                synthetic_name: "Component.svelte?compile".to_string(),
                synthetic_source: String::new(),
                synthetic_source_map_json: None,
                source_anchors: Vec::new(),
                synthetic_lang: ScriptLang::Ts,
                conventions: test_svelte_conventions(),
                declaration_ids: vec!["__lf_0".to_string()],
                targets: vec![CompileTarget {
                    declaration_id: "__lf_0".to_string(),
                    original_span: Span::new(39, 48),
                    normalized_span: Span::new(40, 48),
                    source_map_anchor: None,
                    local_name: "t".to_string(),
                    imported_name: "t".to_string(),
                    flavor: MacroFlavor::Reactive,
                    context: CompileTargetContext::Template,
                    output_kind: CompileTargetOutputKind::Expression,
                    translation_mode: CompileTranslationMode::Context,
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
            runtime_bindings: SvelteCompileRuntimeBindings {
                create_lingui_accessors: "createLinguiAccessors".to_string(),
                context: "__l4s_ctx".to_string(),
                get_i18n: "__l4s_getI18n".to_string(),
                translate: "__l4s_translate".to_string(),
                trans_component: "L4sRuntimeTrans".to_string(),
            },
            instance_script: Some(SvelteCompileScriptRegion {
                outer_span: Span::new(0, 30),
                content_span: Span::new(9, 20),
                lang: ScriptLang::Ts,
            }),
            module_script: None,
        };
        let source = "<script>\n  let x = 1;\n</script>\n<p>\n  {$t`hello`}\n</p>";
        let transformed = TransformedPrograms {
            context_code: Some(
                "const __lf_0 = __l4s_translate({id:\"a\",message:\"hello\"});".to_string(),
            ),
            ..TransformedPrograms::default()
        };

        let finished = finish_compile(&plan, source, &transformed).expect("finish succeeds");

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
