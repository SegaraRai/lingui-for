use serde::{Deserialize, Serialize};

use crate::AnalyzerError;
use crate::common::{EmbeddedScriptRegion, Span};
use crate::framework::astro::analyze_astro;
use crate::framework::js::{JsLikeLanguage, collect_top_level_declared_names_in_javascript};
use crate::framework::parse::parse_typescript;

use super::super::{
    CommonCompilePlan, CompileReplacement, CompileTarget, CompileTargetContext,
    CompileTargetOutputKind, CompileTargetPrototype, CompileTranslationMode, FrameworkCompilePlan,
    RuntimeRequirements, build_compile_plan_for_framework,
};
use super::CommonFrameworkCompileAnalysis;

const ASTRO_BINDING_CREATE_I18N: &str = "__l4a_createI18n";
const ASTRO_BINDING_I18N: &str = "__l4a_i18n";
const ASTRO_BINDING_RUNTIME_TRANS: &str = "L4aRuntimeTrans";
const ASTRO_RUNTIME_PACKAGE: &str = "lingui-for-astro/runtime";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AstroCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_bindings: AstroCompileRuntimeBindings,
    pub frontmatter: Option<AstroCompileFrontmatterRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct AstroCompileRuntimeBindings {
    pub create_i18n: String,
    pub i18n: String,
    pub runtime_trans: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AstroCompileFrontmatterRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub prelude_insert_point: usize,
    pub trailing_whitespace_range: Option<Span>,
    pub has_remaining_content_after_import_removal: bool,
}

impl FrameworkCompilePlan for AstroCompilePlan {
    type Analysis = AstroFrameworkCompileAnalysis;

    fn analyze(source: &str) -> Result<Self::Analysis, AnalyzerError> {
        analyze_astro_compile(source)
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(_prototype: &CompileTargetPrototype, normalized_source: &str) -> String {
        normalized_source.to_string()
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
        declaration_code: &str,
    ) -> Result<String, AnalyzerError> {
        crate::compile::runtime_component::lower_runtime_component_markup(
            declaration_code,
            self.runtime_bindings.runtime_trans.as_str(),
        )
    }

    fn append_runtime_injection_replacements(
        &self,
        _source: &str,
        replacements: &mut Vec<CompileReplacement>,
    ) {
        append_runtime_injection_replacements(self, replacements);
    }
}

impl AstroCompilePlan {
    pub fn build(
        source: &str,
        source_name: &str,
        synthetic_name: &str,
    ) -> Result<Self, AnalyzerError> {
        build_compile_plan_for_framework::<Self>(source, source_name, synthetic_name)
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
) -> Result<AstroFrameworkCompileAnalysis, AnalyzerError> {
    let analysis = analyze_astro(source)?;
    let frontmatter = analysis
        .frontmatter
        .as_ref()
        .map(|region| build_frontmatter_region(source, region));
    let import_removals = analysis
        .frontmatter
        .as_ref()
        .map(|region| collect_macro_import_statement_spans(source, region))
        .transpose()?
        .unwrap_or_default();
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
            synthetic_lang: "ts".to_string(),
        },
        runtime_bindings: create_runtime_bindings(
            analysis
                .frontmatter
                .as_ref()
                .map(|region| &source[region.inner_span.start..region.inner_span.end])
                .unwrap_or(""),
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
) -> Result<AstroCompileRuntimeBindings, AnalyzerError> {
    let declared_names = collect_top_level_declared_names_in_javascript(
        frontmatter_source,
        JsLikeLanguage::TypeScript,
    )?;
    let mut used = declared_names
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();

    Ok(AstroCompileRuntimeBindings {
        create_i18n: allocate_unique_binding_name(&mut used, ASTRO_BINDING_CREATE_I18N),
        i18n: allocate_unique_binding_name(&mut used, ASTRO_BINDING_I18N),
        runtime_trans: allocate_unique_binding_name(&mut used, ASTRO_BINDING_RUNTIME_TRANS),
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
    replacements: &mut Vec<CompileReplacement>,
) {
    let prelude = build_frontmatter_prelude(
        plan.runtime_requirements.needs_runtime_i18n_binding,
        plan.runtime_requirements.needs_runtime_trans_component,
        &plan.runtime_bindings,
    );

    if prelude.is_empty() {
        return;
    }

    if let Some(frontmatter) = &plan.frontmatter {
        let code = if frontmatter.has_remaining_content_after_import_removal {
            format!("{prelude}\n")
        } else {
            prelude
        };
        replacements.push(CompileReplacement {
            declaration_id: "__runtime_frontmatter_prelude".to_string(),
            start: frontmatter.prelude_insert_point,
            end: frontmatter.prelude_insert_point,
            code,
            source_map_json: None,
        });

        if !frontmatter.has_remaining_content_after_import_removal
            && let Some(range) = frontmatter.trailing_whitespace_range
        {
            replacements.push(CompileReplacement {
                declaration_id: "__runtime_frontmatter_trailing_ws".to_string(),
                start: range.start,
                end: range.end,
                code: String::new(),
                source_map_json: None,
            });
        }
        return;
    }

    replacements.push(CompileReplacement {
        declaration_id: "__runtime_frontmatter_block".to_string(),
        start: 0,
        end: 0,
        code: format!("---\n{prelude}\n---\n"),
        source_map_json: None,
    });
}

fn build_frontmatter_prelude(
    include_astro_context: bool,
    include_runtime_trans: bool,
    bindings: &AstroCompileRuntimeBindings,
) -> String {
    let mut lines = String::new();

    if include_astro_context {
        lines.push_str(&format!(
            "import {{ createFrontmatterI18n as {} }} from \"{}\";\n",
            bindings.create_i18n, ASTRO_RUNTIME_PACKAGE
        ));
        lines.push_str(&format!(
            "const {} = {}(Astro.locals);\n",
            bindings.i18n, bindings.create_i18n
        ));
    }

    if include_runtime_trans {
        lines.push_str(&format!(
            "import {{ RuntimeTrans as {} }} from \"{}\";\n",
            bindings.runtime_trans, ASTRO_RUNTIME_PACKAGE
        ));
    }

    lines
}

fn build_frontmatter_region(
    source: &str,
    region: &EmbeddedScriptRegion,
) -> AstroCompileFrontmatterRegion {
    AstroCompileFrontmatterRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        prelude_insert_point: compute_prelude_insert_point(source, region.inner_span.start),
        trailing_whitespace_range: compute_trailing_whitespace_range(source, region),
        has_remaining_content_after_import_removal: has_remaining_content_after_import_removal(
            source, region,
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

fn has_remaining_content_after_import_removal(source: &str, region: &EmbeddedScriptRegion) -> bool {
    let content = &source[region.inner_span.start..region.inner_span.end];
    let ranges = collect_macro_import_statement_spans(source, region).unwrap_or_default();
    let relative_ranges = ranges
        .into_iter()
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
) -> Result<Vec<Span>, AnalyzerError> {
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
        if module_specifier != "lingui-for-astro/macro"
            && module_specifier != "@lingui/macro"
            && module_specifier != "@lingui/core/macro"
            && module_specifier != "@lingui/react/macro"
        {
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
