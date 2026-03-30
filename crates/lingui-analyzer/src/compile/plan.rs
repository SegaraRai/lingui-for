use crate::common::{MappedText, build_segmented_map, compose_source_maps, source_map_to_json};
use crate::conventions::FrameworkConventions;
use crate::framework::{MacroCandidateStrategy, WhitespaceMode, render_macro_import_line};
use crate::synthesis::{SynthesisPlan, build_synthesis_plan};

use super::{
    CommonCompilePlan, CompileError, CompileTarget, CompileTargetPrototype, FrameworkCompilePlan,
};

pub(crate) fn build_compile_plan_for_framework<P: FrameworkCompilePlan>(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    whitespace_mode: WhitespaceMode,
    conventions: FrameworkConventions,
) -> Result<P, CompileError> {
    let mut analysis = P::analyze(source, whitespace_mode, &conventions)?;
    let (imports, prototypes, import_removals, synthetic_lang, source_anchors) = {
        let common_analysis = P::common_analysis(&mut analysis);
        retain_standalone_prototypes(&mut common_analysis.prototypes);
        (
            common_analysis.imports.clone(),
            common_analysis.prototypes.clone(),
            common_analysis.import_removals.clone(),
            common_analysis.synthetic_lang,
            common_analysis.source_anchors.clone(),
        )
    };

    let candidates = prototypes
        .iter()
        .map(|prototype| prototype.candidate.clone())
        .collect::<Vec<_>>();
    let synthetic_plan = build_synthesis_plan(source, &imports, &candidates);
    let synthetic = build_compile_synthetic_source(
        source,
        source_name,
        &synthetic_plan,
        &prototypes,
        &source_anchors,
        |prototype, normalized_source| {
            P::wrap_compile_source(&analysis, prototype, normalized_source)
        },
    )?;
    let declaration_ids = synthetic_plan
        .targets
        .iter()
        .map(|target| target.declaration_id.clone())
        .collect::<Vec<_>>();
    let mut targets = prototypes
        .clone()
        .into_iter()
        .zip(synthetic_plan.targets.iter())
        .map(|(prototype, target)| CompileTarget {
            declaration_id: target.declaration_id.clone(),
            original_span: target.candidate.outer_span,
            normalized_span: prototype.candidate.normalized_span,
            source_map_anchor: target.candidate.source_map_anchor,
            local_name: target.candidate.local_name.clone(),
            imported_name: target.candidate.imported_name.clone(),
            flavor: target.candidate.flavor,
            context: prototype.context,
            output_kind: prototype.output_kind,
            translation_mode: prototype.translation_mode,
            normalized_segments: target.normalized_segments.clone(),
        })
        .collect::<Vec<_>>();

    P::repair_compile_targets(source, &mut targets);
    let runtime_requirements = P::compute_runtime_requirements(&targets);
    let common = CommonCompilePlan {
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        synthetic_source: synthetic.code,
        synthetic_source_map_json: synthetic
            .source_map
            .and_then(|map| source_map_to_json(&map)),
        source_anchors,
        synthetic_lang,
        conventions,
        declaration_ids,
        targets,
        import_removals,
    };

    Ok(P::assemble_plan(common, runtime_requirements, analysis))
}

fn retain_standalone_prototypes(prototypes: &mut Vec<CompileTargetPrototype>) {
    prototypes.sort_by_key(|prototype| {
        (
            prototype.candidate.outer_span.start,
            prototype.candidate.outer_span.end,
        )
    });
    prototypes
        .retain(|prototype| prototype.candidate.strategy == MacroCandidateStrategy::Standalone);
}

fn build_compile_synthetic_source(
    source: &str,
    source_name: &str,
    synthetic_plan: &SynthesisPlan,
    prototypes: &[CompileTargetPrototype],
    source_anchors: &[usize],
    wrap_compile_source: impl Fn(
        &CompileTargetPrototype,
        &str,
    ) -> Result<crate::common::RenderedMappedText, CompileError>,
) -> Result<crate::common::RenderedMappedText, CompileError> {
    let mut output = MappedText::new(source_name, source);

    if let Some(line) = render_macro_import_line(&synthetic_plan.imports) {
        output.push_unmapped(line);
        output.push_unmapped("\n");
    }

    for (prototype, target) in prototypes.iter().zip(synthetic_plan.targets.iter()) {
        let normalized_map = build_segmented_map(
            source_name,
            source,
            &target.normalized_code,
            &target.normalized_segments,
            source_anchors,
        )
        .map_err(|error| CompileError::Adapter(super::AdapterError::Other(error.to_string())))?;
        let wrapped = wrap_compile_source(prototype, &target.normalized_code)?;
        let wrapped_map = match (wrapped.source_map.as_ref(), normalized_map.as_ref()) {
            (Some(upper), Some(lower)) => {
                Some(compose_source_maps(upper, lower).map_err(|error| {
                    CompileError::Adapter(super::AdapterError::Other(error.to_string()))
                })?)
            }
            (Some(_), None) | (None, Some(_)) => None,
            (None, None) => None,
        };

        output.push_unmapped("const ");
        output.push_unmapped(&target.declaration_id);
        output.push_unmapped(" = ");
        if let Some(map) = wrapped_map {
            output.push_pre_mapped(wrapped.code, map);
        } else {
            output.push_unmapped(wrapped.code);
        }
        output.push_unmapped(";\n");
    }

    output
        .into_rendered()
        .map_err(|error| CompileError::Adapter(super::AdapterError::Other(error.to_string())))
}

#[cfg(test)]
mod tests {
    use crate::common::Span;
    use crate::framework::{MacroImport, render_macro_import_line};

    fn import(source: &str, imported_name: &str, local_name: &str) -> MacroImport {
        MacroImport {
            source: source.to_string(),
            imported_name: imported_name.to_string(),
            local_name: local_name.to_string(),
            span: Span::new(0, 0),
        }
    }

    #[test]
    fn renders_import_specifiers_in_stable_sorted_order() {
        let imports = vec![
            import("pkg", "zeta", "zLocal"),
            import("pkg", "alpha", "alpha"),
            import("pkg", "beta", "bLocal"),
        ];

        assert_eq!(
            render_macro_import_line(&imports),
            Some("import { alpha, beta as bLocal, zeta as zLocal } from \"pkg\";".to_string())
        );
    }

    #[test]
    fn de_dupes_and_ignores_input_order_for_import_specifiers() {
        let ordered = vec![
            import("pkg", "zeta", "zLocal"),
            import("pkg", "alpha", "alpha"),
            import("pkg", "alpha", "alpha"),
            import("pkg", "beta", "bLocal"),
        ];
        let reversed = vec![
            import("pkg", "beta", "bLocal"),
            import("pkg", "alpha", "alpha"),
            import("pkg", "zeta", "zLocal"),
            import("pkg", "alpha", "alpha"),
        ];

        let rendered =
            Some("import { alpha, beta as bLocal, zeta as zLocal } from \"pkg\";".to_string());

        assert_eq!(render_macro_import_line(&ordered), rendered);
        assert_eq!(render_macro_import_line(&reversed), rendered);
    }

    #[test]
    fn keeps_sources_sorted_independently_from_specifier_order() {
        let imports = vec![
            import("z-pkg", "beta", "beta"),
            import("a-pkg", "zeta", "zLocal"),
            import("a-pkg", "alpha", "alpha"),
        ];

        assert_eq!(
            render_macro_import_line(&imports),
            Some(
                "import { alpha, zeta as zLocal } from \"a-pkg\";\nimport { beta } from \"z-pkg\";"
                    .to_string()
            )
        );
    }
}
