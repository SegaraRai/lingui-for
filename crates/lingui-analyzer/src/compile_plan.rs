use crate::framework::{FrameworkAdapter, astro::AstroAdapter, svelte::SvelteAdapter};
use crate::model::{
    CompilePlan, CompileTarget, CompileTargetContext, CompileTargetOutputKind,
    CompileTranslationMode, MacroCandidate, RuntimeRequirements, SyntheticModule,
};
use crate::synthetic::build_synthetic_module_with_names;
use crate::{AnalyzerError, MacroCandidateKind};

const SVELTE_REACTIVE_WRAPPER: &str = "__lingui_for_svelte_reactive_translation__";
const SVELTE_EAGER_WRAPPER: &str = "__lingui_for_svelte_eager_translation__";

#[derive(Debug, Clone)]
struct CompileTargetPrototype {
    candidate: MacroCandidate,
    context: CompileTargetContext,
    output_kind: CompileTargetOutputKind,
    translation_mode: CompileTranslationMode,
}

pub fn build_compile_plan_for_framework(
    framework: &str,
    source: &str,
) -> Result<CompilePlan, AnalyzerError> {
    build_compile_plan_for_framework_with_names(
        framework,
        source,
        "source",
        "synthetic-compile.tsx",
    )
}

pub fn build_compile_plan_for_framework_with_names(
    framework: &str,
    source: &str,
    source_name: &str,
    synthetic_name: &str,
) -> Result<CompilePlan, AnalyzerError> {
    match framework {
        "astro" => build_astro_compile_plan(source, source_name, synthetic_name),
        "svelte" => build_svelte_compile_plan(source, source_name, synthetic_name),
        _ => Err(AnalyzerError::UnsupportedFramework(framework.to_string())),
    }
}

fn build_svelte_compile_plan(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
) -> Result<CompilePlan, AnalyzerError> {
    let analysis = SvelteAdapter.analyze(source)?;
    let imports = analysis
        .scripts
        .iter()
        .flat_map(|script| script.macro_imports.iter().cloned())
        .collect::<Vec<_>>();
    let mut prototypes = Vec::new();

    for script in &analysis.scripts {
        let context = if script.is_module {
            CompileTargetContext::ModuleScript
        } else {
            CompileTargetContext::InstanceScript
        };
        let translation_mode = if script.is_module {
            CompileTranslationMode::Raw
        } else {
            CompileTranslationMode::SvelteContext
        };

        prototypes.extend(script.candidates.iter().cloned().map(|candidate| {
            CompileTargetPrototype {
                output_kind: classify_output_kind(candidate.kind),
                candidate,
                context,
                translation_mode,
            }
        }));
    }

    for expression in &analysis.template_expressions {
        prototypes.extend(expression.candidates.iter().cloned().map(|candidate| {
            CompileTargetPrototype {
                output_kind: CompileTargetOutputKind::Expression,
                candidate,
                context: CompileTargetContext::Template,
                translation_mode: CompileTranslationMode::SvelteContext,
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
                translation_mode: CompileTranslationMode::SvelteContext,
            }),
    );

    build_compile_plan(
        "svelte",
        source,
        source_name,
        synthetic_name,
        &imports,
        prototypes,
    )
}

fn build_astro_compile_plan(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
) -> Result<CompilePlan, AnalyzerError> {
    let analysis = AstroAdapter.analyze(source)?;
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
                translation_mode: CompileTranslationMode::AstroContext,
            }),
    );
    for expression in &analysis.template_expressions {
        prototypes.extend(expression.candidates.iter().cloned().map(|candidate| {
            CompileTargetPrototype {
                output_kind: CompileTargetOutputKind::Expression,
                candidate,
                context: CompileTargetContext::Template,
                translation_mode: CompileTranslationMode::AstroContext,
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
                translation_mode: CompileTranslationMode::AstroContext,
            }),
    );

    build_compile_plan(
        "astro",
        source,
        source_name,
        synthetic_name,
        &analysis.macro_imports,
        prototypes,
    )
}

fn build_compile_plan(
    framework: &str,
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    imports: &[crate::MacroImport],
    mut prototypes: Vec<CompileTargetPrototype>,
) -> Result<CompilePlan, AnalyzerError> {
    prototypes.sort_by_key(|prototype| {
        (
            prototype.candidate.outer_span.start,
            prototype.candidate.outer_span.end,
        )
    });
    let candidates = prototypes
        .iter()
        .map(|prototype| prototype.candidate.clone())
        .collect::<Vec<_>>();
    let extract_synthetic = build_synthetic_module_with_names(
        source,
        source_name,
        synthetic_name,
        imports,
        &candidates,
    );
    let synthetic_source =
        build_compile_synthetic_source(framework, &extract_synthetic, source, &prototypes);
    let declaration_ids = extract_synthetic.declaration_ids.clone();
    let targets = prototypes
        .into_iter()
        .zip(extract_synthetic.mappings.iter())
        .map(|(prototype, mapping)| CompileTarget {
            declaration_id: mapping.declaration_id.clone(),
            original_span: mapping.original_span,
            normalized_span: prototype.candidate.normalized_span,
            source_map_anchor: mapping.source_map_anchor,
            local_name: mapping.local_name.clone(),
            imported_name: mapping.imported_name.clone(),
            flavor: mapping.flavor,
            context: prototype.context,
            output_kind: prototype.output_kind,
            translation_mode: prototype.translation_mode,
            normalized_segments: mapping.normalized_segments.clone(),
        })
        .collect::<Vec<_>>();
    let runtime_requirements = compute_runtime_requirements(framework, &targets);

    Ok(CompilePlan {
        framework: framework.to_string(),
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        synthetic_source,
        declaration_ids,
        targets,
        runtime_requirements,
    })
}

fn build_compile_synthetic_source(
    framework: &str,
    extract_synthetic: &SyntheticModule,
    original_source: &str,
    prototypes: &[CompileTargetPrototype],
) -> String {
    let mut output = extract_synthetic.source.clone();

    for (prototype, mapping) in prototypes
        .iter()
        .zip(extract_synthetic.mappings.iter())
        .rev()
    {
        let normalized = build_normalized_source(mapping, original_source);
        let compile_source = wrap_compile_source(framework, prototype, &normalized);
        output = replace_synthetic_initializer(&output, &mapping.declaration_id, &compile_source);
    }

    output
}

fn build_normalized_source(mapping: &crate::SyntheticMapping, original_source: &str) -> String {
    if mapping.normalized_segments.is_empty() {
        return original_source[mapping.original_span.start..mapping.original_span.end].to_string();
    }

    mapping
        .normalized_segments
        .iter()
        .map(|segment| {
            original_source[segment.original_start..segment.original_start + segment.len]
                .to_string()
        })
        .collect::<String>()
}

fn wrap_compile_source(
    framework: &str,
    prototype: &CompileTargetPrototype,
    normalized_source: &str,
) -> String {
    if framework == "svelte" && prototype.output_kind == CompileTargetOutputKind::Expression {
        match prototype.candidate.flavor {
            crate::MacroFlavor::Reactive => {
                return format!(
                    "{SVELTE_REACTIVE_WRAPPER}({normalized_source}, {:?})",
                    prototype.candidate.local_name
                );
            }
            crate::MacroFlavor::Eager => {
                return format!("{SVELTE_EAGER_WRAPPER}({normalized_source})");
            }
            crate::MacroFlavor::Direct => {}
        }
    }

    normalized_source.to_string()
}

fn replace_synthetic_initializer(source: &str, declaration_id: &str, replacement: &str) -> String {
    let prefix = format!("const {declaration_id} = ");
    let Some(start) = source.find(&prefix) else {
        return source.to_string();
    };
    let initializer_start = start + prefix.len();
    let Some(initializer_end) = source[initializer_start..].find(";\n") else {
        return source.to_string();
    };
    let initializer_end = initializer_start + initializer_end;

    format!(
        "{}{}{}",
        &source[..initializer_start],
        replacement,
        &source[initializer_end..]
    )
}

fn compute_runtime_requirements(framework: &str, targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: targets.iter().any(|target| match framework {
            "astro" => true,
            "svelte" => {
                target.translation_mode == CompileTranslationMode::SvelteContext
                    && target.output_kind == CompileTargetOutputKind::Expression
            }
            _ => false,
        }),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == CompileTargetOutputKind::Component),
    }
}

fn classify_output_kind(kind: MacroCandidateKind) -> CompileTargetOutputKind {
    match kind {
        MacroCandidateKind::Component => CompileTargetOutputKind::Component,
        MacroCandidateKind::CallExpression | MacroCandidateKind::TaggedTemplateExpression => {
            CompileTargetOutputKind::Expression
        }
    }
}
