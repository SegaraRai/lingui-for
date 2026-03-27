use std::collections::BTreeMap;

use crate::framework::{MacroCandidateStrategy, MacroImport};
use crate::synthesis::{SynthesisPlan, build_synthesis_plan};

use super::{CommonCompilePlan, CompileTarget, CompileTargetPrototype, FrameworkCompilePlan};

pub(crate) fn build_compile_plan_for_framework<P: FrameworkCompilePlan>(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
) -> Result<P, crate::AnalyzerError> {
    let mut analysis = P::analyze(source)?;
    let common_analysis = P::common_analysis(&mut analysis);
    retain_standalone_prototypes(&mut common_analysis.prototypes);

    let candidates = common_analysis
        .prototypes
        .iter()
        .map(|prototype| prototype.candidate.clone())
        .collect::<Vec<_>>();
    let synthetic_plan = build_synthesis_plan(source, &common_analysis.imports, &candidates);
    let synthetic_source = build_compile_synthetic_source(
        &synthetic_plan,
        &common_analysis.prototypes,
        P::wrap_compile_source,
    );
    let declaration_ids = synthetic_plan
        .targets
        .iter()
        .map(|target| target.declaration_id.clone())
        .collect::<Vec<_>>();
    let mut targets = common_analysis
        .prototypes
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
        synthetic_source,
        synthetic_lang: common_analysis.synthetic_lang.clone(),
        declaration_ids,
        targets,
        import_removals: common_analysis.import_removals.clone(),
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
    synthetic_plan: &SynthesisPlan,
    prototypes: &[CompileTargetPrototype],
    wrap_compile_source: impl Fn(&CompileTargetPrototype, &str) -> String,
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
        output.push_str(&wrap_compile_source(prototype, &target.normalized_code));
        output.push_str(";\n");
    }

    output
}

fn render_import_line(imports: &[MacroImport]) -> Option<String> {
    let mut grouped = BTreeMap::<&str, Vec<(&str, &str)>>::new();
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
