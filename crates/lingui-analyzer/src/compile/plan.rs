use crate::common::{
    MappedText, RenderedMappedText, build_segmented_map, compose_source_maps, index_source_map,
    source_map_to_json,
};
use crate::conventions::FrameworkConventions;
use crate::framework::{MacroCandidateStrategy, WhitespaceMode, render_macro_import_line};
use crate::synthesis::{SynthesisPlan, build_synthesis_plan};

use super::{
    AdapterError, CommonCompilePlan, CompileError, CompileTarget, CompileTargetPrototype,
    FrameworkCompilePlan,
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
    // Keep a final dedupe pass as a safety net against duplicate prototypes.
    prototypes.dedup_by(|left, right| left == right);
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
    ) -> Result<RenderedMappedText, CompileError>,
) -> Result<RenderedMappedText, CompileError> {
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
        .map_err(AdapterError::from)
        .map_err(CompileError::from)?;
        let wrapped = wrap_compile_source(prototype, &target.normalized_code)?;
        let RenderedMappedText {
            code: wrapped_code,
            source_map: wrapped_source_map,
        } = wrapped;
        let wrapped_map = match (wrapped_source_map, normalized_map) {
            (Some(upper), Some(lower)) => Some(
                compose_source_maps(&upper, &index_source_map(&lower))
                    .map_err(AdapterError::from)
                    .map_err(CompileError::from)?,
            ),
            (Some(upper), None) => Some(upper),
            (None, Some(lower)) => Some(lower),
            (None, None) => None,
        };

        output.push_unmapped("const ");
        output.push_unmapped(&target.declaration_id);
        output.push_unmapped(" = ");
        if let Some(map) = wrapped_map {
            output.push_pre_mapped(wrapped_code, map);
        } else {
            output.push_unmapped(wrapped_code);
        }
        output.push_unmapped(";\n");
    }

    output
        .into_rendered()
        .map_err(AdapterError::from)
        .map_err(CompileError::from)
}

#[cfg(test)]
mod tests {
    use super::build_compile_synthetic_source;
    use crate::common::{IndexedText, RenderedMappedText, Span, build_span_anchor_map};
    use crate::compile::{
        CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype,
        CompileTranslationMode,
    };
    use crate::framework::{
        MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, MacroImport,
        render_macro_import_line,
    };
    use crate::synthesis::{NormalizedSegment, SynthesisPlan, SynthesisTarget};

    fn import(source: &str, imported_name: &str, local_name: &str) -> MacroImport {
        MacroImport {
            source: source.to_string(),
            imported_name: imported_name.to_string(),
            local_name: local_name.to_string(),
            span: Span::new(0, 0),
        }
    }

    fn candidate(outer_span: Span) -> MacroCandidate {
        MacroCandidate {
            id: "candidate".to_string(),
            kind: MacroCandidateKind::TaggedTemplateExpression,
            imported_name: "t".to_string(),
            local_name: "t".to_string(),
            flavor: MacroFlavor::Direct,
            outer_span,
            normalized_span: outer_span,
            normalization_edits: Vec::new(),
            source_map_anchor: None,
            owner_id: None,
            strategy: MacroCandidateStrategy::Standalone,
        }
    }

    fn prototype(outer_span: Span) -> CompileTargetPrototype {
        CompileTargetPrototype {
            candidate: candidate(outer_span),
            context: CompileTargetContext::Template,
            output_kind: CompileTargetOutputKind::Expression,
            translation_mode: CompileTranslationMode::Context,
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

    #[test]
    fn preserves_wrapped_source_map_when_normalized_map_is_missing() {
        let source = "source";
        let normalized_code = "wrapped".to_string();
        let synthetic_plan = SynthesisPlan {
            imports: Vec::new(),
            targets: vec![SynthesisTarget {
                declaration_id: "__lf_0".to_string(),
                candidate: candidate(Span::new(0, source.len())),
                normalized_code: normalized_code.clone(),
                normalized_segments: Vec::new(),
            }],
        };
        let prototypes = vec![prototype(Span::new(0, source.len()))];

        let rendered = build_compile_synthetic_source(
            source,
            "test.ts",
            &synthetic_plan,
            &prototypes,
            &[0, source.len()],
            |_, normalized_source| {
                let indexed_source = IndexedText::new(source);
                Ok(RenderedMappedText {
                    code: normalized_source.to_string(),
                    source_map: build_span_anchor_map(
                        "test.ts",
                        &indexed_source,
                        normalized_source,
                        1,
                        4,
                    ),
                })
            },
        )
        .expect("synthetic source builds");

        let token = rendered
            .source_map
            .as_ref()
            .and_then(|map| map.lookup_token(0, "const __lf_0 = ".len() as u32))
            .expect("wrapped mapping should be preserved");

        assert_eq!(token.get_source(), Some("test.ts"));
        assert_eq!(token.get_src_col(), 1);
    }

    #[test]
    fn preserves_normalized_source_map_when_wrapped_map_is_missing() {
        let source = "t`hello`";
        let synthetic_plan = SynthesisPlan {
            imports: Vec::new(),
            targets: vec![SynthesisTarget {
                declaration_id: "__lf_0".to_string(),
                candidate: candidate(Span::new(0, source.len())),
                normalized_code: source.to_string(),
                normalized_segments: vec![NormalizedSegment {
                    original_start: 0,
                    generated_start: 0,
                    len: source.len(),
                }],
            }],
        };
        let prototypes = vec![prototype(Span::new(0, source.len()))];

        let rendered = build_compile_synthetic_source(
            source,
            "test.ts",
            &synthetic_plan,
            &prototypes,
            &[0, source.len()],
            |_, normalized_source| {
                Ok(RenderedMappedText {
                    code: normalized_source.to_string(),
                    source_map: None,
                })
            },
        )
        .expect("synthetic source builds");

        let token = rendered
            .source_map
            .as_ref()
            .and_then(|map| map.lookup_token(0, "const __lf_0 = ".len() as u32))
            .expect("normalized mapping should be preserved");

        assert_eq!(token.get_source(), Some("test.ts"));
        assert_eq!(token.get_src_col(), 0);
    }
}
