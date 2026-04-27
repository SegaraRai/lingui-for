use std::collections::BTreeSet;

use lean_string::LeanString;

use crate::common::{EmbeddedScriptRegion, InvalidSpan, ScriptLang, Span};
use crate::conventions::FrameworkConventions;
use crate::framework::astro::AstroAdapter;
use crate::framework::{AnalyzeOptions, FrameworkAdapter, WhitespaceMode};
use crate::transform::{
    RuntimeRequirements, TransformTarget, TransformTargetContext, TransformTargetOutputKind,
    TransformTargetPrototype, TransformTranslationMode,
};

use super::super::CommonFrameworkTransformAnalysis;
use super::{
    AstroAdapterError, AstroFrameworkTransformAnalysis, AstroTransformFrontmatterRegion,
    AstroTransformRuntimeBindings,
};

pub(crate) fn analyze_astro_transform(
    source: &LeanString,
    source_name: &LeanString,
    whitespace: WhitespaceMode,
    conventions: &FrameworkConventions,
) -> Result<AstroFrameworkTransformAnalysis, AstroAdapterError> {
    let analysis = AstroAdapter.analyze(
        source,
        &AnalyzeOptions {
            source_name: source_name.clone(),
            whitespace,
            conventions: conventions.clone(),
        },
    )?;
    let import_removals = analysis.metadata.frontmatter_import_statement_spans.clone();
    let frontmatter = analysis
        .metadata
        .frontmatter
        .as_ref()
        .map(|region| build_frontmatter_region(source, region, &import_removals))
        .transpose()?;
    let mut prototypes = Vec::new();

    prototypes.extend(
        analysis
            .semantic
            .frontmatter_candidates
            .iter()
            .cloned()
            .map(|candidate| TransformTargetPrototype {
                output_kind: TransformTargetOutputKind::Expression,
                candidate,
                context: TransformTargetContext::Frontmatter,
                translation_mode: TransformTranslationMode::Contextual,
            }),
    );
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

    Ok(AstroFrameworkTransformAnalysis {
        common: CommonFrameworkTransformAnalysis {
            imports: analysis.semantic.macro_imports,
            prototypes,
            import_removals,
            synthetic_lang: ScriptLang::Ts,
            source_anchors: analysis.metadata.source_anchors.clone(),
        },
        runtime_bindings: create_runtime_bindings(
            &analysis.semantic.frontmatter_declared_names,
            conventions,
        )?,
        frontmatter,
        fragment_tag_pairs: analysis.metadata.fragment_tag_pairs,
    })
}

pub(crate) fn compute_runtime_requirements(targets: &[TransformTarget]) -> RuntimeRequirements {
    let needs_runtime_trans_component = targets
        .iter()
        .any(|target| target.output_kind == TransformTargetOutputKind::Component);

    let needs_runtime_i18n_binding = targets.iter().any(|target| {
        target.translation_mode == TransformTranslationMode::Contextual
            && target.output_kind == TransformTargetOutputKind::Expression
            && !matches!(target.imported_name.as_str(), "msg" | "defineMessage")
    });

    RuntimeRequirements {
        needs_runtime_i18n_binding,
        needs_runtime_trans_component,
    }
}

fn create_runtime_bindings(
    declared_names: &[LeanString],
    conventions: &FrameworkConventions,
) -> Result<AstroTransformRuntimeBindings, AstroAdapterError> {
    let mut used = declared_names.iter().cloned().collect::<BTreeSet<_>>();

    Ok(AstroTransformRuntimeBindings {
        create_i18n: allocate_unique_binding_name(
            &mut used,
            conventions.bindings.i18n_accessor_factory.clone().ok_or(
                AstroAdapterError::MissingConvention("bindings.i18n_accessor_factory"),
            )?,
        ),
        i18n: allocate_unique_binding_name(
            &mut used,
            conventions.bindings.i18n_instance.clone().ok_or(
                AstroAdapterError::MissingConvention("bindings.i18n_instance"),
            )?,
        ),
        runtime_trans: allocate_unique_binding_name(
            &mut used,
            conventions.bindings.runtime_trans_component.clone(),
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

fn build_frontmatter_region(
    source: &str,
    region: &EmbeddedScriptRegion,
    import_removals: &[Span],
) -> Result<AstroTransformFrontmatterRegion, AstroAdapterError> {
    Ok(AstroTransformFrontmatterRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        prelude_insert_point: compute_prelude_insert_point(source, region.inner_span.start),
        trailing_whitespace_range: compute_trailing_whitespace_range(source, region),
        has_remaining_content_after_import_removal: has_remaining_content_after_import_removal(
            source,
            region,
            import_removals,
        )?,
    })
}

fn compute_prelude_insert_point(source: &str, content_start: usize) -> usize {
    let mut insert = content_start;
    if source.as_bytes().get(insert) == Some(&b'\r') {
        insert += 1;
    }
    if source.as_bytes().get(insert) == Some(&b'\n') {
        insert += 1;
    }
    insert
}

fn compute_trailing_whitespace_range(source: &str, region: &EmbeddedScriptRegion) -> Option<Span> {
    let outer_source = &source[region.outer_span.start..region.outer_span.end];
    let closing_fence_offset = outer_source.rfind("---")?;
    let closing_fence_start = region.outer_span.start + closing_fence_offset;
    if region.inner_span.end >= closing_fence_start {
        return None;
    }

    let trailing = &source[region.inner_span.end..closing_fence_start];
    if trailing.trim().is_empty() {
        Span::new(region.inner_span.end, closing_fence_start).ok()
    } else {
        None
    }
}

fn has_remaining_content_after_import_removal(
    source: &str,
    region: &EmbeddedScriptRegion,
    import_removals: &[Span],
) -> Result<bool, AstroAdapterError> {
    let content = &source[region.inner_span.start..region.inner_span.end];
    let relative_ranges = import_removals
        .iter()
        .copied()
        .map(|span| {
            let start =
                span.start
                    .checked_sub(region.inner_span.start)
                    .ok_or(InvalidSpan::Reversed {
                        start: span.start,
                        end: region.inner_span.start,
                    })?;
            let end =
                span.end
                    .checked_sub(region.inner_span.start)
                    .ok_or(InvalidSpan::Reversed {
                        start: span.end,
                        end: region.inner_span.start,
                    })?;
            Span::new(start, end)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut cursor = 0usize;
    for range in relative_ranges {
        if !content[cursor..range.start].trim().is_empty() {
            return Ok(true);
        }
        cursor = range.end;
    }
    Ok(!content[cursor..].trim().is_empty())
}
