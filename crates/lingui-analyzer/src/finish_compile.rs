use std::collections::BTreeMap;

use crate::compile_emit::{collect_compile_replacements, finish_compile_from_replacements};
use crate::component_lowering::lower_svelte_runtime_component_markup;
use crate::parse;
use crate::{
    AnalyzerError, CompilePlan, CompileTargetOutputKind, CompileTranslationMode, FinishedCompile,
    TransformedPrograms,
};

pub fn finish_compile(
    plan: &CompilePlan,
    source: &str,
    transformed_programs: &TransformedPrograms,
) -> Result<FinishedCompile, AnalyzerError> {
    let lowered_declarations = lower_transformed_declarations(plan, transformed_programs)?;
    let replacements = collect_compile_replacements(plan, source, &lowered_declarations)?;
    finish_compile_from_replacements(source, &plan.source_name, replacements)
}

fn lower_transformed_declarations(
    plan: &CompilePlan,
    transformed_programs: &TransformedPrograms,
) -> Result<BTreeMap<String, String>, AnalyzerError> {
    let declaration_sets = collect_transformed_declarations(transformed_programs)?;
    let runtime_component_name = plan
        .runtime_bindings
        .as_ref()
        .map(|bindings| bindings.trans_component.as_str())
        .unwrap_or("L4sRuntimeTrans");
    let mut lowered = BTreeMap::new();

    for target in &plan.targets {
        let Some(code) = declaration_sets
            .get(&target.translation_mode)
            .and_then(|declarations| declarations.get(&target.declaration_id))
        else {
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

fn collect_transformed_declarations(
    programs: &TransformedPrograms,
) -> Result<BTreeMap<CompileTranslationMode, BTreeMap<String, String>>, AnalyzerError> {
    let mut declarations = BTreeMap::new();

    if let Some(code) = &programs.raw_code {
        declarations.insert(
            CompileTranslationMode::Raw,
            collect_declarations_from_program(code)?,
        );
    }
    if let Some(code) = &programs.svelte_context_code {
        declarations.insert(
            CompileTranslationMode::SvelteContext,
            collect_declarations_from_program(code)?,
        );
    }
    if let Some(code) = &programs.astro_context_code {
        declarations.insert(
            CompileTranslationMode::AstroContext,
            collect_declarations_from_program(code)?,
        );
    }

    Ok(declarations)
}

fn collect_declarations_from_program(source: &str) -> Result<BTreeMap<String, String>, AnalyzerError> {
    let tree = parse::parse_tsx(source)?;
    let root = tree.root_node();
    let mut declarations = BTreeMap::new();
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
            let value_start = extend_start_for_leading_comments(source, value.start_byte());

            declarations.insert(
                source[name.start_byte()..name.end_byte()].to_string(),
                source[value_start..value.end_byte()].to_string(),
            );
        }
    }

    Ok(declarations)
}

fn extend_start_for_leading_comments(source: &str, start: usize) -> usize {
    let bytes = source.as_bytes();
    let mut current = start;

    loop {
        let mut cursor = current;
        while cursor > 0 && bytes[cursor - 1].is_ascii_whitespace() {
            cursor -= 1;
        }

        if cursor < 2 || &source[cursor - 2..cursor] != "*/" {
            return current;
        }

        let Some(comment_start) = source[..cursor - 2].rfind("/*") else {
            return current;
        };
        current = comment_start;
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        CompilePlan, CompileRuntimeBindings, CompileScriptRegion, CompileTarget,
        CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode, MacroFlavor,
        NormalizedSegment, RuntimeRequirements, Span, TransformedPrograms,
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
        let transformed = TransformedPrograms {
            svelte_context_code: Some(
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
