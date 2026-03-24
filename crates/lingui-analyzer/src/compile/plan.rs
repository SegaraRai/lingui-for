use crate::AnalyzerError;
use crate::compile::adapters::{
    FrameworkCompileAdapter, FrameworkCompileAnalysis, compile_adapter_for_framework,
};
use crate::compile::{CompilePlan, CompileTarget, CompileTargetPrototype};
use crate::framework::MacroCandidateStrategy;
use crate::synthetic::{SyntheticPlan, build_synthetic_plan};

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
    let adapter = compile_adapter_for_framework(framework)?;
    let mut analysis = adapter.analyze_compile(source)?;
    analysis.prototypes.sort_by_key(|prototype| {
        (
            prototype.candidate.outer_span.start,
            prototype.candidate.outer_span.end,
        )
    });
    analysis
        .prototypes
        .retain(|prototype| prototype.candidate.strategy == MacroCandidateStrategy::Standalone);

    build_compile_plan(adapter, source, source_name, synthetic_name, analysis)
}

fn build_compile_plan(
    adapter: &dyn FrameworkCompileAdapter,
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    analysis: FrameworkCompileAnalysis,
) -> Result<CompilePlan, AnalyzerError> {
    let candidates = analysis
        .prototypes
        .iter()
        .map(|prototype| prototype.candidate.clone())
        .collect::<Vec<_>>();
    let synthetic_plan = build_synthetic_plan(source, &analysis.imports, &candidates);
    let synthetic_source =
        build_compile_synthetic_source(adapter, &synthetic_plan, &analysis.prototypes);
    let declaration_ids = synthetic_plan
        .targets
        .iter()
        .map(|target| target.declaration_id.clone())
        .collect::<Vec<_>>();
    let mut targets = analysis
        .prototypes
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

    adapter.repair_compile_targets(source, &mut targets);
    let runtime_requirements = adapter.compute_runtime_requirements(&targets);

    Ok(CompilePlan {
        framework: adapter.framework_name().to_string(),
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        synthetic_source,
        synthetic_lang: analysis.synthetic_lang,
        declaration_ids,
        targets,
        runtime_requirements,
        runtime_bindings: analysis.runtime_bindings,
        import_removals: analysis.import_removals,
        instance_script: analysis.instance_script,
        module_script: analysis.module_script,
    })
}

fn build_compile_synthetic_source(
    adapter: &dyn FrameworkCompileAdapter,
    synthetic_plan: &SyntheticPlan,
    prototypes: &[CompileTargetPrototype],
) -> String {
    let mut output = String::new();

    if let Some(line) = render_import_line(&synthetic_plan.imports) {
        output.push_str(&line);
        output.push('\n');
    }

    for (prototype, target) in prototypes.iter().zip(synthetic_plan.targets.iter()) {
        output.push_str("const ");
        output.push_str(&target.declaration_id);
        output.push_str(" = ");
        output.push_str(&adapter.wrap_compile_source(prototype, &target.normalized_code));
        output.push_str(";\n");
    }

    output
}

fn render_import_line(imports: &[crate::framework::MacroImport]) -> Option<String> {
    let mut grouped = std::collections::BTreeMap::<&str, Vec<(&str, &str)>>::new();
    for import_decl in imports {
        let specifiers = grouped.entry(import_decl.source.as_str()).or_default();
        let specifier = (
            import_decl.imported_name.as_str(),
            import_decl.local_name.as_str(),
        );
        if !specifiers.contains(&specifier) {
            specifiers.push(specifier);
        }
    }

    if grouped.is_empty() {
        return None;
    }

    let lines = grouped
        .into_iter()
        .map(|(source, specifiers)| {
            let rendered = specifiers
                .into_iter()
                .map(|(imported_name, local_name)| {
                    if imported_name == local_name {
                        local_name.to_string()
                    } else {
                        format!("{imported_name} as {local_name}")
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("import {{ {rendered} }} from \"{source}\";")
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(lines)
}
