use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{
    EmbeddedScriptRegion, IndexedText, MappedText, RenderedMappedText, ScriptLang, Span,
    build_copy_map, build_span_anchor_map,
};
use crate::conventions::FrameworkConventions;
use crate::framework::astro::{AstroAdapter, AstroFrameworkError};
use crate::framework::js::{
    JsAnalysisError, JsLikeLanguage, collect_top_level_declared_names_in_javascript,
};
use crate::framework::parse::{ParseError, parse_typescript};
use crate::framework::{AnalyzeOptions, FrameworkAdapter, FrameworkError, WhitespaceMode};

use super::super::{
    CommonCompilePlan, CompileError, CompileReplacementInternal, CompileTarget,
    CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype, CompileTranslationMode,
    FrameworkCompilePlan, RuntimeComponentError, RuntimeRequirements,
    build_compile_plan_for_framework,
};
use super::{AdapterError, CommonFrameworkCompileAnalysis};

#[derive(thiserror::Error, Debug)]
pub enum AstroAdapterError {
    #[error(transparent)]
    Framework(#[from] FrameworkError),
    #[error(transparent)]
    AstroFramework(#[from] AstroFrameworkError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error("missing Astro convention field: {0}")]
    MissingConvention(&'static str),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_bindings: AstroCompileRuntimeBindings,
    pub frontmatter: Option<AstroCompileFrontmatterRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroCompileRuntimeBindings {
    pub create_i18n: String,
    pub i18n: String,
    pub runtime_trans: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AstroCompileFrontmatterRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub prelude_insert_point: usize,
    pub trailing_whitespace_range: Option<Span>,
    pub has_remaining_content_after_import_removal: bool,
}

impl FrameworkCompilePlan for AstroCompilePlan {
    type Analysis = AstroFrameworkCompileAnalysis;

    fn analyze(
        source: &str,
        source_name: &str,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, CompileError> {
        Ok(
            analyze_astro_compile(source, source_name, whitespace_mode, conventions)
                .map_err(AdapterError::from)?,
        )
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(
        _analysis: &Self::Analysis,
        _prototype: &CompileTargetPrototype,
        normalized_source: &str,
    ) -> Result<RenderedMappedText, CompileError> {
        let indexed_source = IndexedText::new(normalized_source);
        let mut mapped = MappedText::new("__normalized", normalized_source);
        if let Some(map) = build_copy_map(
            "__normalized",
            &indexed_source,
            Span::new(0, normalized_source.len()),
            &[],
        ) {
            mapped.push_pre_mapped(normalized_source, map);
        } else {
            mapped.push_unmapped(normalized_source);
        }
        mapped
            .into_rendered()
            .map_err(AdapterError::from)
            .map_err(CompileError::from)
    }

    fn repair_compile_targets(_source: &str, _targets: &mut [CompileTarget]) {}

    fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
        compute_runtime_requirements(targets)
    }

    fn assemble_plan(
        common: CommonCompilePlan,
        runtime_requirements: RuntimeRequirements,
        analysis: Self::Analysis,
    ) -> Self {
        Self {
            common,
            runtime_requirements,
            runtime_bindings: analysis.runtime_bindings,
            frontmatter: analysis.frontmatter,
        }
    }

    fn common(&self) -> &CommonCompilePlan {
        &self.common
    }

    fn lower_runtime_component_markup(
        &self,
        source_name: &str,
        source: &str,
        declaration: &RenderedMappedText,
    ) -> Result<RenderedMappedText, RuntimeComponentError> {
        crate::compile::runtime_component::lower_runtime_component_markup(
            source_name,
            source,
            declaration,
            self.runtime_bindings.runtime_trans.as_str(),
        )
    }

    fn append_runtime_injection_replacements(
        &self,
        source: &str,
        replacements: &mut Vec<CompileReplacementInternal>,
    ) -> Result<(), AdapterError> {
        append_runtime_injection_replacements(self, source, replacements)
            .map_err(AdapterError::from)
    }
}

impl AstroCompilePlan {
    pub fn build(
        source: &str,
        source_name: &str,
        synthetic_name: &str,
        whitespace_mode: WhitespaceMode,
        conventions: FrameworkConventions,
    ) -> Result<Self, CompileError> {
        build_compile_plan_for_framework::<Self>(
            source,
            source_name,
            synthetic_name,
            whitespace_mode,
            conventions,
        )
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AstroFrameworkCompileAnalysis {
    pub(crate) common: CommonFrameworkCompileAnalysis,
    pub(crate) runtime_bindings: AstroCompileRuntimeBindings,
    pub(crate) frontmatter: Option<AstroCompileFrontmatterRegion>,
}

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
    let import_removals = analysis
        .frontmatter
        .as_ref()
        .map(|region| collect_macro_import_statement_spans(source, region, conventions))
        .transpose()?
        .unwrap_or_default();
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
                translation_mode: CompileTranslationMode::Context,
            }),
    );
    for expression in &analysis.template_expressions {
        prototypes.extend(expression.candidates.iter().cloned().map(|candidate| {
            CompileTargetPrototype {
                output_kind: CompileTargetOutputKind::Expression,
                candidate,
                context: CompileTargetContext::Template,
                translation_mode: CompileTranslationMode::Context,
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
                translation_mode: CompileTranslationMode::Context,
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
            analysis
                .frontmatter
                .as_ref()
                .map(|region| &source[region.inner_span.start..region.inner_span.end])
                .unwrap_or(""),
            conventions,
        )?,
        frontmatter,
    })
}

pub(crate) fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: !targets.is_empty(),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == CompileTargetOutputKind::Component),
    }
}

fn create_runtime_bindings(
    frontmatter_source: &str,
    conventions: &FrameworkConventions,
) -> Result<AstroCompileRuntimeBindings, AstroAdapterError> {
    let declared_names = collect_top_level_declared_names_in_javascript(
        frontmatter_source,
        JsLikeLanguage::TypeScript,
    )?;
    let mut used = declared_names
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();

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

fn allocate_unique_binding_name(
    used: &mut std::collections::BTreeSet<String>,
    preferred: &str,
) -> String {
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

fn append_runtime_injection_replacements(
    plan: &AstroCompilePlan,
    source: &str,
    replacements: &mut Vec<CompileReplacementInternal>,
) -> Result<(), AstroAdapterError> {
    let indexed_source = IndexedText::new(source);
    let prelude = build_frontmatter_prelude(
        plan.runtime_requirements.needs_runtime_i18n_binding,
        plan.runtime_requirements.needs_runtime_trans_component,
        &plan.runtime_bindings,
        &plan.common.conventions,
    )?;

    if prelude.is_empty() {
        return Ok(());
    }

    if let Some(frontmatter) = &plan.frontmatter {
        let code = if frontmatter.has_remaining_content_after_import_removal {
            format!("{prelude}\n")
        } else {
            prelude
        };
        let anchor_span = plan
            .common
            .import_removals
            .first()
            .copied()
            .unwrap_or(Span::new(
                frontmatter.prelude_insert_point,
                frontmatter.prelude_insert_point,
            ));
        let source_map = build_span_anchor_map(
            plan.common.source_name.as_str(),
            &indexed_source,
            code.as_str(),
            anchor_span.start,
            anchor_span.end,
        );
        replacements.push(CompileReplacementInternal::new(
            "__runtime_frontmatter_prelude".to_string(),
            frontmatter.prelude_insert_point,
            frontmatter.prelude_insert_point,
            code,
            source_map,
            Vec::new(),
        ));

        if !frontmatter.has_remaining_content_after_import_removal
            && let Some(range) = frontmatter.trailing_whitespace_range
        {
            replacements.push(CompileReplacementInternal::new(
                "__runtime_frontmatter_trailing_ws".to_string(),
                range.start,
                range.end,
                String::new(),
                None,
                Vec::new(),
            ));
        }
        return Ok(());
    }

    let code = format!("---\n{prelude}\n---\n");
    let source_map = build_span_anchor_map(
        plan.common.source_name.as_str(),
        &indexed_source,
        code.as_str(),
        0,
        0,
    );
    replacements.push(CompileReplacementInternal::new(
        "__runtime_frontmatter_block".to_string(),
        0,
        0,
        code,
        source_map,
        Vec::new(),
    ));
    Ok(())
}

fn build_frontmatter_prelude(
    include_astro_context: bool,
    include_runtime_trans: bool,
    bindings: &AstroCompileRuntimeBindings,
    conventions: &FrameworkConventions,
) -> Result<String, AstroAdapterError> {
    let mut lines = String::new();
    let runtime_package = conventions.runtime.package.as_str();
    let trans_export = conventions.runtime.exports.trans.as_str();
    let i18n_accessor_export = conventions.runtime.exports.i18n_accessor.as_deref().ok_or(
        AstroAdapterError::MissingConvention("runtime.exports.i18n_accessor"),
    )?;

    if include_astro_context {
        lines.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            i18n_accessor_export, bindings.create_i18n, runtime_package
        ));
        lines.push_str(&format!(
            "const {} = {}(Astro.locals);\n",
            bindings.i18n, bindings.create_i18n
        ));
    }

    if include_runtime_trans {
        lines.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            trans_export, bindings.runtime_trans, runtime_package
        ));
    }

    Ok(lines)
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

fn collect_macro_import_statement_spans(
    source: &str,
    region: &EmbeddedScriptRegion,
    conventions: &FrameworkConventions,
) -> Result<Vec<Span>, AstroAdapterError> {
    let frontmatter_source = &source[region.inner_span.start..region.inner_span.end];
    let tree = parse_typescript(frontmatter_source)?;
    let root = tree.root_node();
    let mut spans = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        if child.kind() != "import_statement" {
            continue;
        }
        let Some(source_node) = child.child_by_field_name("source") else {
            continue;
        };
        let module_specifier =
            &frontmatter_source[source_node.start_byte() + 1..source_node.end_byte() - 1];
        if !conventions.accepts_macro_package(module_specifier) {
            continue;
        }

        let mut end = child.end_byte();
        while matches!(frontmatter_source.as_bytes().get(end), Some(b'\r' | b'\n')) {
            end += 1;
        }
        spans.push(Span::new(
            region.inner_span.start + child.start_byte(),
            region.inner_span.start + end,
        ));
    }

    Ok(spans)
}
