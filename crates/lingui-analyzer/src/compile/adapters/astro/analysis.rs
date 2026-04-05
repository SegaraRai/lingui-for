use std::collections::BTreeSet;

use crate::common::{EmbeddedScriptRegion, ScriptLang, Span};
use crate::compile::{
    CompileTarget, CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype,
    CompileTranslationMode, RuntimeRequirements,
};
use crate::conventions::FrameworkConventions;
use crate::framework::astro::AstroAdapter;
use crate::framework::{AnalyzeOptions, FrameworkAdapter, WhitespaceMode};

use super::super::CommonFrameworkCompileAnalysis;
use super::{
    AstroAdapterError, AstroCompileFrontmatterRegion, AstroCompileRuntimeBindings,
    AstroFrameworkCompileAnalysis,
};

pub(crate) fn analyze_astro_compile(
    source: &str,
    source_name: &str,
    whitespace: WhitespaceMode,
    conventions: &FrameworkConventions,
) -> Result<AstroFrameworkCompileAnalysis, AstroAdapterError> {
    let analysis = AstroAdapter.analyze(
        source,
        &AnalyzeOptions {
            source_name: source_name.to_string(),
            whitespace,
            conventions: conventions.clone(),
        },
    )?;
    let import_removals = analysis.frontmatter_import_statement_spans.clone();
    let frontmatter = analysis
        .frontmatter
        .as_ref()
        .map(|region| build_frontmatter_region(source, region, &import_removals));
    let mut prototypes = Vec::new();

    prototypes.extend(
        analysis
            .frontmatter_candidates
            .iter()
            .cloned()
            .map(|candidate| CompileTargetPrototype {
                output_kind: CompileTargetOutputKind::Expression,
                candidate,
                context: CompileTargetContext::Frontmatter,
                translation_mode: CompileTranslationMode::Contextual,
            }),
    );
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

    Ok(AstroFrameworkCompileAnalysis {
        common: CommonFrameworkCompileAnalysis {
            imports: analysis.macro_imports,
            prototypes,
            import_removals,
            synthetic_lang: ScriptLang::Ts,
            source_anchors: analysis.source_anchors.clone(),
        },
        runtime_bindings: create_runtime_bindings(
            &analysis.frontmatter_declared_names,
            conventions,
        )?,
        frontmatter,
    })
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

fn create_runtime_bindings(
    declared_names: &[String],
    conventions: &FrameworkConventions,
) -> Result<AstroCompileRuntimeBindings, AstroAdapterError> {
    let mut used = declared_names.iter().cloned().collect::<BTreeSet<_>>();

    Ok(AstroCompileRuntimeBindings {
        create_i18n: allocate_unique_binding_name(
            &mut used,
            conventions
                .bindings
                .i18n_accessor_factory
                .as_deref()
                .ok_or(AstroAdapterError::MissingConvention(
                    "bindings.i18n_accessor_factory",
                ))?,
        ),
        i18n: allocate_unique_binding_name(
            &mut used,
            conventions.bindings.i18n_instance.as_deref().ok_or(
                AstroAdapterError::MissingConvention("bindings.i18n_instance"),
            )?,
        ),
        runtime_trans: allocate_unique_binding_name(
            &mut used,
            conventions.bindings.runtime_trans_component.as_str(),
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

fn build_frontmatter_region(
    source: &str,
    region: &EmbeddedScriptRegion,
    import_removals: &[Span],
) -> AstroCompileFrontmatterRegion {
    AstroCompileFrontmatterRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        prelude_insert_point: compute_prelude_insert_point(source, region.inner_span.start),
        trailing_whitespace_range: compute_trailing_whitespace_range(source, region),
        has_remaining_content_after_import_removal: has_remaining_content_after_import_removal(
            source,
            region,
            import_removals,
        ),
    }
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
        Some(Span::new(region.inner_span.end, closing_fence_start))
    } else {
        None
    }
}

fn has_remaining_content_after_import_removal(
    source: &str,
    region: &EmbeddedScriptRegion,
    import_removals: &[Span],
) -> bool {
    let content = &source[region.inner_span.start..region.inner_span.end];
    let relative_ranges = import_removals
        .iter()
        .copied()
        .map(|span| {
            Span::new(
                span.start - region.inner_span.start,
                span.end - region.inner_span.start,
            )
        })
        .collect::<Vec<_>>();
    let mut cursor = 0usize;
    for range in relative_ranges {
        if !content[cursor..range.start].trim().is_empty() {
            return true;
        }
        cursor = range.end;
    }
    !content[cursor..].trim().is_empty()
}
