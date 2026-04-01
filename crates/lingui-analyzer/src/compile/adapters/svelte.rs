use std::borrow::Cow;
use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{
    EmbeddedScriptRegion, MappedText, MappedTextError, RenderedMappedText, ScriptLang, Span,
    build_copy_map, build_span_anchor_map,
};
use crate::conventions::FrameworkConventions;
use crate::framework::svelte::{SvelteAdapter, SvelteFrameworkError};
use crate::framework::{
    AnalyzeOptions, FrameworkAdapter, FrameworkError, MacroCandidate, MacroCandidateKind,
    MacroCandidateStrategy, MacroFlavor, WhitespaceMode,
};

use super::super::{
    CommonCompilePlan, CompileError, CompileReplacementInternal, CompileTarget,
    CompileTargetContext, CompileTargetOutputKind, CompileTargetPrototype, CompileTranslationMode,
    FrameworkCompilePlan, RuntimeComponentError, RuntimeRequirements,
    build_compile_plan_for_framework,
};
use super::{AdapterError, CommonFrameworkCompileAnalysis};

#[derive(thiserror::Error, Debug)]
pub enum SvelteAdapterError {
    #[error(transparent)]
    Framework(#[from] FrameworkError),
    #[error(transparent)]
    SvelteFramework(#[from] SvelteFrameworkError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
    #[error(
        "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations."
    )]
    BareDirectTNotAllowed,
    #[error(
        "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
    )]
    BareDirectMacroRequiresReactiveOrEager { imported_name: Cow<'static, str> },
    #[error("missing Svelte convention field: {0}")]
    MissingConvention(&'static str),
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteCompileRuntimeBindings {
    pub create_lingui_accessors: String,
    pub context: String,
    pub get_i18n: String,
    pub translate: String,
    pub trans_component: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteCompileScriptRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub lang: ScriptLang,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SvelteCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_bindings: SvelteCompileRuntimeBindings,
    pub instance_script: Option<SvelteCompileScriptRegion>,
    pub module_script: Option<SvelteCompileScriptRegion>,
}

impl FrameworkCompilePlan for SvelteCompilePlan {
    type Analysis = SvelteFrameworkCompileAnalysis;

    fn analyze(
        source: &str,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, CompileError> {
        Ok(analyze_svelte_compile(source, whitespace_mode, conventions)
            .map_err(AdapterError::from)?)
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(
        analysis: &Self::Analysis,
        prototype: &CompileTargetPrototype,
        normalized_source: &str,
    ) -> Result<RenderedMappedText, CompileError> {
        wrap_compile_source(analysis, prototype, normalized_source)
            .map_err(AdapterError::from)
            .map_err(CompileError::from)
    }

    fn repair_compile_targets(source: &str, targets: &mut [CompileTarget]) {
        repair_compile_targets(source, targets);
    }

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
            instance_script: analysis.instance_script,
            module_script: analysis.module_script,
        }
    }

    fn common(&self) -> &CommonCompilePlan {
        &self.common
    }

    fn lower_runtime_component_markup(
        &self,
        source_name: &str,
        source: &str,
        declaration: RenderedMappedText,
    ) -> Result<RenderedMappedText, RuntimeComponentError> {
        crate::compile::runtime_component::lower_runtime_component_markup(
            source_name,
            source,
            declaration,
            self.runtime_bindings.trans_component.as_str(),
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

impl SvelteCompilePlan {
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
pub(crate) struct SvelteFrameworkCompileAnalysis {
    pub(crate) common: CommonFrameworkCompileAnalysis,
    pub(crate) conventions: FrameworkConventions,
    pub(crate) runtime_bindings: SvelteCompileRuntimeBindings,
    pub(crate) instance_script: Option<SvelteCompileScriptRegion>,
    pub(crate) module_script: Option<SvelteCompileScriptRegion>,
}

pub(crate) fn analyze_svelte_compile(
    source: &str,
    whitespace: WhitespaceMode,
    conventions: &FrameworkConventions,
) -> Result<SvelteFrameworkCompileAnalysis, SvelteAdapterError> {
    let analysis = SvelteAdapter.analyze(
        source,
        &AnalyzeOptions {
            whitespace,
            conventions: conventions.clone(),
        },
    )?;
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
            CompileTranslationMode::Context
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

    validate_compile_targets(&prototypes)?;

    Ok(SvelteFrameworkCompileAnalysis {
        common: CommonFrameworkCompileAnalysis {
            imports,
            prototypes,
            import_removals,
            synthetic_lang: instance_script
                .as_ref()
                .map(|script| script.lang)
                .or_else(|| module_script.as_ref().map(|script| script.lang))
                .unwrap_or(ScriptLang::Ts),
            source_anchors: analysis.source_anchors.clone(),
        },
        conventions: conventions.clone(),
        runtime_bindings: create_runtime_bindings(
            analysis
                .scripts
                .iter()
                .find(|script| !script.is_module)
                .map(|script| script.declared_names.as_slice())
                .unwrap_or(&[]),
            conventions,
        )?,
        instance_script: instance_script.clone(),
        module_script: module_script.clone(),
    })
}

pub(crate) fn classify_output_kind(kind: MacroCandidateKind) -> CompileTargetOutputKind {
    match kind {
        MacroCandidateKind::Component => CompileTargetOutputKind::Component,
        MacroCandidateKind::CallExpression | MacroCandidateKind::TaggedTemplateExpression => {
            CompileTargetOutputKind::Expression
        }
    }
}

pub(crate) fn compile_script_region(
    region: &EmbeddedScriptRegion,
    is_typescript: bool,
) -> SvelteCompileScriptRegion {
    SvelteCompileScriptRegion {
        outer_span: region.outer_span,
        content_span: region.inner_span,
        lang: if is_typescript {
            ScriptLang::Ts
        } else {
            ScriptLang::Js
        },
    }
}

pub(crate) fn wrap_compile_source(
    analysis: &SvelteFrameworkCompileAnalysis,
    prototype: &CompileTargetPrototype,
    normalized_source: &str,
) -> Result<RenderedMappedText, SvelteAdapterError> {
    let mut mapped = MappedText::new("__normalized", normalized_source);
    if prototype.output_kind == CompileTargetOutputKind::Expression {
        match prototype.candidate.flavor {
            MacroFlavor::Reactive => {
                let wrapper = analysis
                    .conventions
                    .wrappers
                    .as_ref()
                    .and_then(|wrappers| wrappers.reactive_translation.as_deref())
                    .ok_or(SvelteAdapterError::MissingConvention(
                        "wrappers.reactive_translation",
                    ))?;
                push_wrapper_anchor(&mut mapped, normalized_source, &format!("{wrapper}("), 0);
                push_wrapped_copy(
                    &mut mapped,
                    normalized_source,
                    Span::new(0, normalized_source.len()),
                );
                push_wrapper_anchor(
                    &mut mapped,
                    normalized_source,
                    &format!(", {:?})", prototype.candidate.local_name),
                    normalized_source.len(),
                );
                return mapped.into_rendered().map_err(SvelteAdapterError::from);
            }
            MacroFlavor::Eager => {
                let wrapper = analysis
                    .conventions
                    .wrappers
                    .as_ref()
                    .and_then(|wrappers| wrappers.eager_translation.as_deref())
                    .ok_or(SvelteAdapterError::MissingConvention(
                        "wrappers.eager_translation",
                    ))?;
                push_wrapper_anchor(&mut mapped, normalized_source, &format!("{wrapper}("), 0);
                push_wrapped_copy(
                    &mut mapped,
                    normalized_source,
                    Span::new(0, normalized_source.len()),
                );
                push_wrapper_anchor(&mut mapped, normalized_source, ")", normalized_source.len());
                return mapped.into_rendered().map_err(SvelteAdapterError::from);
            }
            MacroFlavor::Direct => {}
        }
    }

    push_wrapped_copy(
        &mut mapped,
        normalized_source,
        Span::new(0, normalized_source.len()),
    );
    mapped.into_rendered().map_err(SvelteAdapterError::from)
}

fn push_wrapper_anchor(
    mapped: &mut MappedText<'_>,
    normalized_source: &str,
    text: &str,
    original_byte: usize,
) {
    let Some(map) = build_span_anchor_map(
        "__normalized",
        normalized_source,
        text,
        original_byte,
        original_byte,
    ) else {
        return;
    };
    mapped.push_pre_mapped(text, map);
}

fn push_wrapped_copy(mapped: &mut MappedText<'_>, normalized_source: &str, span: Span) {
    if let Some(map) = build_copy_map("__normalized", normalized_source, span, &[]) {
        mapped.push_pre_mapped(&normalized_source[span.start..span.end], map);
    } else {
        mapped.push_unmapped(&normalized_source[span.start..span.end]);
    }
}

pub(crate) fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: targets.iter().any(|target| {
            target.translation_mode == CompileTranslationMode::Context
                && target.output_kind == CompileTargetOutputKind::Expression
                && !matches!(target.imported_name.as_str(), "msg" | "defineMessage")
        }),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == CompileTargetOutputKind::Component),
    }
}

pub(crate) fn create_runtime_bindings(
    declared_names: &[String],
    conventions: &FrameworkConventions,
) -> Result<SvelteCompileRuntimeBindings, SvelteAdapterError> {
    let mut used = declared_names.iter().cloned().collect::<BTreeSet<_>>();
    let bindings = &conventions.bindings;

    Ok(SvelteCompileRuntimeBindings {
        create_lingui_accessors: allocate_unique_binding_name(
            &mut used,
            bindings.i18n_accessor_factory.as_deref().ok_or(
                SvelteAdapterError::MissingConvention("bindings.i18n_accessor_factory"),
            )?,
        ),
        context: allocate_unique_binding_name(
            &mut used,
            bindings
                .context
                .as_deref()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.context"))?,
        ),
        get_i18n: allocate_unique_binding_name(
            &mut used,
            bindings
                .get_i18n
                .as_deref()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.get_i18n"))?,
        ),
        translate: allocate_unique_binding_name(
            &mut used,
            bindings
                .translate
                .as_deref()
                .ok_or(SvelteAdapterError::MissingConvention("bindings.translate"))?,
        ),
        trans_component: allocate_unique_binding_name(
            &mut used,
            bindings.runtime_trans_component.as_str(),
        ),
    })
}

pub(crate) fn repair_compile_targets(source: &str, targets: &mut [CompileTarget]) {
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

pub(crate) fn validate_compile_targets(
    prototypes: &[CompileTargetPrototype],
) -> Result<(), SvelteAdapterError> {
    let offending_macro = prototypes.iter().find_map(|prototype| {
        (matches!(
            prototype.context,
            CompileTargetContext::ModuleScript | CompileTargetContext::InstanceScript
        ) && prototype.output_kind == CompileTargetOutputKind::Expression
            && is_forbidden_bare_direct_svelte_macro(&prototype.candidate))
        .then_some(prototype.candidate.imported_name.as_str())
    });

    if let Some(imported_name) = offending_macro {
        return Err(match imported_name {
            "t" => SvelteAdapterError::BareDirectTNotAllowed,
            "plural" => SvelteAdapterError::BareDirectMacroRequiresReactiveOrEager {
                imported_name: Cow::Borrowed("plural"),
            },
            "select" => SvelteAdapterError::BareDirectMacroRequiresReactiveOrEager {
                imported_name: Cow::Borrowed("select"),
            },
            "selectOrdinal" => SvelteAdapterError::BareDirectMacroRequiresReactiveOrEager {
                imported_name: Cow::Borrowed("selectOrdinal"),
            },
            other => SvelteAdapterError::BareDirectMacroRequiresReactiveOrEager {
                imported_name: Cow::Owned(other.to_string()),
            },
        });
    }

    Ok(())
}

pub(super) fn append_runtime_injection_replacements(
    plan: &SvelteCompilePlan,
    source: &str,
    replacements: &mut Vec<CompileReplacementInternal>,
) -> Result<(), SvelteAdapterError> {
    let runtime_bindings = &plan.runtime_bindings;

    let needs_lingui_context = plan.runtime_requirements.needs_runtime_i18n_binding;
    let needs_trans_component = plan.runtime_requirements.needs_runtime_trans_component;
    if !needs_lingui_context && !needs_trans_component {
        return Ok(());
    }

    if let Some(instance_script) = &plan.instance_script {
        let original_script_content =
            &source[instance_script.content_span.start..instance_script.content_span.end];
        let injections = create_runtime_binding_insertions(
            original_script_content,
            runtime_bindings,
            needs_lingui_context,
            needs_trans_component,
            &plan.common.conventions,
        )?;
        let insertion_start =
            get_script_insertion_start(source, instance_script.content_span.start);

        if !injections.prelude.is_empty() {
            let anchor_span = plan
                .common
                .import_removals
                .first()
                .copied()
                .unwrap_or(Span::new(insertion_start, insertion_start));
            let prelude = injections.prelude;
            let source_map = build_span_anchor_map(
                plan.common.source_name.as_str(),
                source,
                prelude.as_str(),
                anchor_span.start,
                anchor_span.end,
            );
            replacements.push(CompileReplacementInternal {
                declaration_id: "__runtime_prelude".to_string(),
                start: insertion_start,
                end: insertion_start,
                code: prelude,
                source_map,
                original_anchors: Vec::new(),
            });
        }

        if !injections.suffix.is_empty() {
            replacements.push(CompileReplacementInternal {
                declaration_id: "__runtime_suffix".to_string(),
                start: instance_script.content_span.end,
                end: instance_script.content_span.end,
                code: injections.suffix,
                source_map: None,
                original_anchors: Vec::new(),
            });
        }

        return Ok(());
    }

    let injected = create_runtime_binding_insertions(
        "",
        runtime_bindings,
        needs_lingui_context,
        needs_trans_component,
        &plan.common.conventions,
    )?;
    let block = format!("<script>\n{}{}</script>", injected.prelude, injected.suffix);
    let insertion_start = plan
        .module_script
        .as_ref()
        .map(|region| region.outer_span.end)
        .unwrap_or(0);
    let code = if plan.module_script.is_some() {
        format!("\n\n{block}")
    } else {
        format!("{block}\n\n")
    };

    let source_map = build_span_anchor_map(
        plan.common.source_name.as_str(),
        source,
        code.as_str(),
        insertion_start,
        insertion_start,
    );
    replacements.push(CompileReplacementInternal {
        declaration_id: "__runtime_script_block".to_string(),
        start: insertion_start,
        end: insertion_start,
        code,
        source_map,
        original_anchors: Vec::new(),
    });
    Ok(())
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

fn find_svelte_prefix_near(
    source: &str,
    current_start: usize,
    current_end: usize,
    pattern: &str,
) -> Option<usize> {
    let window_start =
        clamp_to_char_boundary_floor(source, current_start.saturating_sub(pattern.len() + 8));
    let window_end = clamp_to_char_boundary_ceil(source, current_end.min(source.len()));
    source[window_start..window_end]
        .match_indices(pattern)
        .map(|(offset, _)| window_start + offset)
        .filter(|start| *start <= current_start)
        .max()
}

fn clamp_to_char_boundary_floor(source: &str, mut index: usize) -> usize {
    index = index.min(source.len());
    while index > 0 && !source.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn clamp_to_char_boundary_ceil(source: &str, mut index: usize) -> usize {
    index = index.min(source.len());
    while index < source.len() && !source.is_char_boundary(index) {
        index += 1;
    }
    index
}

struct RuntimeInsertions {
    prelude: String,
    suffix: String,
}

fn create_runtime_binding_insertions(
    original_script_content: &str,
    runtime_bindings: &SvelteCompileRuntimeBindings,
    include_lingui_context: bool,
    include_trans_component: bool,
    conventions: &FrameworkConventions,
) -> Result<RuntimeInsertions, SvelteAdapterError> {
    let mut prelude = String::new();
    let mut suffix = String::new();
    let runtime_package = conventions.runtime.package.as_str();
    let trans_export = conventions.runtime.exports.trans.as_str();
    let i18n_accessor_export = conventions.runtime.exports.i18n_accessor.as_deref().ok_or(
        SvelteAdapterError::MissingConvention("runtime.exports.i18n_accessor"),
    )?;

    if include_lingui_context && include_trans_component {
        prelude.push_str(&format!(
            "import {{ {} as {}, {} as {} }} from \"{}\";\n",
            trans_export,
            runtime_bindings.trans_component,
            i18n_accessor_export,
            runtime_bindings.create_lingui_accessors,
            runtime_package
        ));
    } else if include_lingui_context {
        prelude.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            i18n_accessor_export, runtime_bindings.create_lingui_accessors, runtime_package
        ));
    } else if include_trans_component {
        prelude.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            trans_export, runtime_bindings.trans_component, runtime_package
        ));
    }

    if include_lingui_context {
        prelude.push_str(&format!(
            "const {} = {}();\nconst {} = {}.getI18n;\nconst {} = {}._;\n",
            runtime_bindings.context,
            runtime_bindings.create_lingui_accessors,
            runtime_bindings.get_i18n,
            runtime_bindings.context,
            runtime_bindings.translate,
            runtime_bindings.context
        ));
        suffix.push_str(&format!("{}.prime();\n", runtime_bindings.context));
    }

    let indent = detect_script_indent(original_script_content);
    Ok(RuntimeInsertions {
        prelude: if prelude.is_empty() {
            String::new()
        } else {
            format_inserted_script(&prelude, &indent, false, false)
        },
        suffix: if suffix.is_empty() {
            String::new()
        } else {
            format_inserted_script(&suffix, &indent, true, false)
        },
    })
}

fn detect_script_indent(content: &str) -> String {
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        return line
            .chars()
            .take_while(|char| matches!(char, ' ' | '\t'))
            .collect();
    }
    String::new()
}

fn get_script_insertion_start(source: &str, content_start: usize) -> usize {
    match (
        source.as_bytes().get(content_start),
        source.as_bytes().get(content_start + 1),
    ) {
        (Some(b'\r'), Some(b'\n')) => content_start + 2,
        (Some(b'\n'), _) => content_start + 1,
        _ => content_start,
    }
}

fn format_inserted_script(
    code: &str,
    indent: &str,
    leading_newline: bool,
    trailing_blank_line: bool,
) -> String {
    let body = code
        .trim_end_matches('\n')
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                line.to_string()
            } else {
                format!("{indent}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let leading = if leading_newline { "\n" } else { "" };
    let trailing = if trailing_blank_line { "\n\n" } else { "\n" };
    format!("{leading}{body}{trailing}")
}

fn is_forbidden_bare_direct_svelte_macro(candidate: &MacroCandidate) -> bool {
    candidate.strategy == MacroCandidateStrategy::Standalone
        && candidate.flavor == MacroFlavor::Direct
        && matches!(
            candidate.imported_name.as_str(),
            "t" | "plural" | "select" | "selectOrdinal"
        )
}
