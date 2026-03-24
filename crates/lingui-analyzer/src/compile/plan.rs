use crate::AnalyzerError;
use crate::common::{EmbeddedScriptRegion, Span};
use crate::compile::{
    CompilePlan, CompileRuntimeBindings, CompileScriptRegion, CompileTarget, CompileTargetContext,
    CompileTargetOutputKind, CompileTargetPrototype, CompileTranslationMode, RuntimeRequirements,
};
use crate::framework::{
    FrameworkAdapter, MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor,
    MacroImport, astro::AstroAdapter, svelte::SvelteAdapter,
};
use crate::synthetic::{SyntheticPlan, build_synthetic_plan};

const SVELTE_REACTIVE_WRAPPER: &str = "__lingui_for_svelte_reactive_translation__";
const SVELTE_EAGER_WRAPPER: &str = "__lingui_for_svelte_eager_translation__";
const SVELTE_BINDING_CREATE_LINGUI_ACCESSORS: &str = "createLinguiAccessors";
const SVELTE_BINDING_CONTEXT: &str = "__l4s_ctx";
const SVELTE_BINDING_GET_I18N: &str = "__l4s_getI18n";
const SVELTE_BINDING_TRANSLATE: &str = "__l4s_translate";
const SVELTE_BINDING_RUNTIME_TRANS: &str = "L4sRuntimeTrans";

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

pub(crate) fn repair_compile_plan_for_export(source: &str, plan: &mut CompilePlan) {
    if plan.framework == "svelte" {
        repair_svelte_compile_targets(source, &mut plan.targets);
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
    let import_removals = analysis
        .scripts
        .iter()
        .flat_map(|script| script.macro_import_statement_spans.iter().copied())
        .collect::<Vec<_>>();
    let instance_script = analysis
        .scripts
        .iter()
        .find(|script| !script.is_module)
        .map(|script| compile_script_region(&script.region, script.is_typescript));
    let module_script = analysis
        .scripts
        .iter()
        .find(|script| script.is_module)
        .map(|script| compile_script_region(&script.region, script.is_typescript));
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

    validate_svelte_compile_targets(&prototypes)?;

    build_compile_plan(
        "svelte",
        source,
        source_name,
        synthetic_name,
        &imports,
        prototypes,
        SvelteCompileMetadata {
            import_removals,
            runtime_bindings: Some(create_svelte_runtime_bindings(
                analysis
                    .scripts
                    .iter()
                    .find(|script| !script.is_module)
                    .map(|script| script.declared_names.as_slice())
                    .unwrap_or(&[]),
            )),
            instance_script,
            module_script,
        },
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
        SvelteCompileMetadata::default(),
    )
}

#[derive(Debug, Clone, Default)]
struct SvelteCompileMetadata {
    import_removals: Vec<Span>,
    runtime_bindings: Option<CompileRuntimeBindings>,
    instance_script: Option<CompileScriptRegion>,
    module_script: Option<CompileScriptRegion>,
}

fn build_compile_plan(
    framework: &str,
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    imports: &[MacroImport],
    mut prototypes: Vec<CompileTargetPrototype>,
    metadata: SvelteCompileMetadata,
) -> Result<CompilePlan, AnalyzerError> {
    prototypes.sort_by_key(|prototype| {
        (
            prototype.candidate.outer_span.start,
            prototype.candidate.outer_span.end,
        )
    });
    prototypes
        .retain(|prototype| prototype.candidate.strategy == MacroCandidateStrategy::Standalone);
    let candidates = prototypes
        .iter()
        .map(|prototype| prototype.candidate.clone())
        .collect::<Vec<_>>();
    let synthetic_plan = build_synthetic_plan(source, imports, &candidates);
    let synthetic_source = build_compile_synthetic_source(framework, &synthetic_plan, &prototypes);
    let declaration_ids = synthetic_plan
        .targets
        .iter()
        .map(|target| target.declaration_id.clone())
        .collect::<Vec<_>>();
    let mut targets = prototypes
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
    let runtime_requirements = compute_runtime_requirements(framework, &targets);

    Ok(CompilePlan {
        framework: framework.to_string(),
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        synthetic_source,
        synthetic_lang: compile_synthetic_lang(framework, &metadata),
        declaration_ids,
        runtime_requirements,
        runtime_bindings: metadata.runtime_bindings,
        import_removals: metadata.import_removals,
        instance_script: metadata.instance_script,
        module_script: metadata.module_script,
        targets: {
            if framework == "svelte" {
                repair_svelte_compile_targets(source, &mut targets);
            }
            targets
        },
    })
}

fn compile_synthetic_lang(framework: &str, metadata: &SvelteCompileMetadata) -> String {
    if framework == "svelte" {
        if let Some(instance_script) = &metadata.instance_script {
            return script_region_lang(instance_script).to_string();
        }
        if let Some(module_script) = &metadata.module_script {
            return script_region_lang(module_script).to_string();
        }
    }

    "ts".to_string()
}

fn script_region_lang(region: &CompileScriptRegion) -> &'static str {
    if region.lang == "js" { "js" } else { "ts" }
}

fn build_compile_synthetic_source(
    framework: &str,
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
        output.push_str(&wrap_compile_source(
            framework,
            prototype,
            &target.normalized_code,
        ));
        output.push_str(";\n");
    }

    output
}

fn wrap_compile_source(
    framework: &str,
    prototype: &CompileTargetPrototype,
    normalized_source: &str,
) -> String {
    if framework == "svelte" && prototype.output_kind == CompileTargetOutputKind::Expression {
        match prototype.candidate.flavor {
            MacroFlavor::Reactive => {
                return format!(
                    "{SVELTE_REACTIVE_WRAPPER}({normalized_source}, {:?})",
                    prototype.candidate.local_name
                );
            }
            MacroFlavor::Eager => {
                return format!("{SVELTE_EAGER_WRAPPER}({normalized_source})");
            }
            MacroFlavor::Direct => {}
        }
    }

    normalized_source.to_string()
}

fn compute_runtime_requirements(framework: &str, targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: targets.iter().any(|target| match framework {
            "astro" => true,
            "svelte" => {
                target.translation_mode == CompileTranslationMode::SvelteContext
                    && target.output_kind == CompileTargetOutputKind::Expression
                    && !matches!(target.imported_name.as_str(), "msg" | "defineMessage")
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

fn repair_svelte_compile_targets(source: &str, targets: &mut [CompileTarget]) {
    for target in targets {
        match target.flavor {
            MacroFlavor::Reactive => {
                let pattern = format!("${}", target.local_name);
                let Some(start) = find_svelte_prefix_near(
                    source,
                    target.original_span.start,
                    target.original_span.end,
                    &pattern,
                ) else {
                    continue;
                };
                if start >= target.original_span.start {
                    continue;
                }

                target.original_span = Span::new(start, target.original_span.end);
                target.normalized_span = target.original_span;
                target.source_map_anchor = Some(Span::new(start + 1, start + pattern.len()));
                if let Some(first) = target.normalized_segments.first_mut() {
                    first.original_start = start + 1;
                }
            }
            MacroFlavor::Eager => {
                let pattern = format!("{}.eager", target.local_name);
                let Some(start) = find_svelte_prefix_near(
                    source,
                    target.original_span.start,
                    target.original_span.end,
                    &pattern,
                ) else {
                    continue;
                };
                if start >= target.original_span.start {
                    continue;
                }

                target.original_span = Span::new(start, target.original_span.end);
                target.normalized_span = Span::new(start, target.normalized_span.end);
                target.source_map_anchor = Some(Span::new(start, start + target.local_name.len()));
                if let Some(first) = target.normalized_segments.first_mut() {
                    first.original_start = start;
                }
            }
            MacroFlavor::Direct => {}
        }
    }
}

fn find_svelte_prefix_near(
    source: &str,
    current_start: usize,
    current_end: usize,
    pattern: &str,
) -> Option<usize> {
    let window_start = current_start.saturating_sub(pattern.len() + 8);
    let window_end = current_end.min(source.len());
    source[window_start..window_end]
        .match_indices(pattern)
        .map(|(offset, _)| window_start + offset)
        .filter(|start| *start <= current_start)
        .max()
}

fn compile_script_region(
    region: &EmbeddedScriptRegion,
    is_typescript: bool,
) -> CompileScriptRegion {
    CompileScriptRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        lang: if is_typescript { "ts" } else { "js" }.to_string(),
    }
}

fn create_svelte_runtime_bindings(declared_names: &[String]) -> CompileRuntimeBindings {
    let mut used = declared_names
        .iter()
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();

    CompileRuntimeBindings {
        create_lingui_accessors: allocate_unique_binding_name(
            &mut used,
            SVELTE_BINDING_CREATE_LINGUI_ACCESSORS,
        ),
        context: allocate_unique_binding_name(&mut used, SVELTE_BINDING_CONTEXT),
        get_i18n: allocate_unique_binding_name(&mut used, SVELTE_BINDING_GET_I18N),
        translate: allocate_unique_binding_name(&mut used, SVELTE_BINDING_TRANSLATE),
        trans_component: allocate_unique_binding_name(&mut used, SVELTE_BINDING_RUNTIME_TRANS),
    }
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

fn validate_svelte_compile_targets(
    prototypes: &[CompileTargetPrototype],
) -> Result<(), AnalyzerError> {
    let offending_macro = prototypes.iter().find_map(|prototype| {
        (matches!(
            prototype.context,
            CompileTargetContext::ModuleScript | CompileTargetContext::InstanceScript
        ) && prototype.output_kind == CompileTargetOutputKind::Expression
            && is_forbidden_bare_direct_svelte_macro(&prototype.candidate))
        .then_some(prototype.candidate.imported_name.as_str())
    });

    if let Some(imported_name) = offending_macro {
        return Err(AnalyzerError::InvalidMacroUsage(bare_direct_macro_message(
            imported_name,
        )));
    }

    Ok(())
}

fn is_forbidden_bare_direct_svelte_macro(candidate: &MacroCandidate) -> bool {
    candidate.strategy == MacroCandidateStrategy::Standalone
        && candidate.flavor == MacroFlavor::Direct
        && matches!(
            candidate.imported_name.as_str(),
            "t" | "plural" | "select" | "selectOrdinal"
        )
}

fn bare_direct_macro_message(imported_name: &str) -> String {
    match imported_name {
        "t" => {
            "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string()
        }
        "plural" | "select" | "selectOrdinal" => format!(
            "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
        ),
        other => format!("Unsupported bare direct macro `{other}` in `.svelte` files."),
    }
}

fn render_import_line(imports: &[MacroImport]) -> Option<String> {
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
