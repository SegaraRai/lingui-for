use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use tree_sitter::Node;

use crate::AnalyzerError;
use crate::common::{EmbeddedScriptRegion, Span};
use crate::framework::svelte::{analyze_svelte, bare_direct_macro_message};
use crate::framework::{
    MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, parse,
};

use super::super::{
    CommonCompilePlan, CompileReplacement, CompileTarget, CompileTargetContext,
    CompileTargetOutputKind, CompileTargetPrototype, FrameworkCompilePlan, RuntimeRequirements,
    build_compile_plan_for_framework,
};
use super::CommonFrameworkCompileAnalysis;

const SVELTE_REACTIVE_WRAPPER: &str = "__lingui_for_svelte_reactive_translation__";
const SVELTE_EAGER_WRAPPER: &str = "__lingui_for_svelte_eager_translation__";
const SVELTE_BINDING_CREATE_LINGUI_ACCESSORS: &str = "createLinguiAccessors";
const SVELTE_BINDING_CONTEXT: &str = "__l4s_ctx";
const SVELTE_BINDING_GET_I18N: &str = "__l4s_getI18n";
const SVELTE_BINDING_TRANSLATE: &str = "__l4s_translate";
const SVELTE_BINDING_RUNTIME_TRANS: &str = "L4sRuntimeTrans";
const SVELTE_RUNTIME_PACKAGE: &str = "lingui-for-svelte/runtime";

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct SvelteCompileRuntimeBindings {
    pub create_lingui_accessors: String,
    pub context: String,
    pub get_i18n: String,
    pub translate: String,
    pub trans_component: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SvelteCompileScriptRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub lang: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SvelteCompilePlan {
    pub common: CommonCompilePlan,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_bindings: SvelteCompileRuntimeBindings,
    pub instance_script: Option<SvelteCompileScriptRegion>,
    pub module_script: Option<SvelteCompileScriptRegion>,
}

impl FrameworkCompilePlan for SvelteCompilePlan {
    type Analysis = SvelteFrameworkCompileAnalysis;

    fn analyze(source: &str) -> Result<Self::Analysis, AnalyzerError> {
        analyze_svelte_compile(source)
    }

    fn common_analysis(analysis: &mut Self::Analysis) -> &mut CommonFrameworkCompileAnalysis {
        &mut analysis.common
    }

    fn wrap_compile_source(prototype: &CompileTargetPrototype, normalized_source: &str) -> String {
        wrap_compile_source(prototype, normalized_source)
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
        declaration_code: &str,
    ) -> Result<String, AnalyzerError> {
        lower_runtime_component_markup(
            declaration_code,
            self.runtime_bindings.trans_component.as_str(),
        )
    }

    fn append_runtime_injection_replacements(
        &self,
        source: &str,
        replacements: &mut Vec<CompileReplacement>,
    ) {
        append_runtime_injection_replacements(self, source, replacements);
    }
}

impl SvelteCompilePlan {
    pub fn build(
        source: &str,
        source_name: &str,
        synthetic_name: &str,
    ) -> Result<Self, AnalyzerError> {
        build_compile_plan_for_framework::<Self>(source, source_name, synthetic_name)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SvelteFrameworkCompileAnalysis {
    pub(crate) common: CommonFrameworkCompileAnalysis,
    pub(crate) runtime_bindings: SvelteCompileRuntimeBindings,
    pub(crate) instance_script: Option<SvelteCompileScriptRegion>,
    pub(crate) module_script: Option<SvelteCompileScriptRegion>,
}

pub(crate) fn analyze_svelte_compile(
    source: &str,
) -> Result<SvelteFrameworkCompileAnalysis, AnalyzerError> {
    let analysis = analyze_svelte(source)?;
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
            crate::compile::CompileTranslationMode::Raw
        } else {
            crate::compile::CompileTranslationMode::Context
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
                translation_mode: crate::compile::CompileTranslationMode::Context,
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
                translation_mode: crate::compile::CompileTranslationMode::Context,
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
                .map(script_region_lang)
                .or_else(|| module_script.as_ref().map(script_region_lang))
                .unwrap_or("ts")
                .to_string(),
        },
        runtime_bindings: create_runtime_bindings(
            analysis
                .scripts
                .iter()
                .find(|script| !script.is_module)
                .map(|script| script.declared_names.as_slice())
                .unwrap_or(&[]),
        ),
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
        lang: if is_typescript { "ts" } else { "js" }.to_string(),
    }
}

pub(crate) fn script_region_lang(region: &SvelteCompileScriptRegion) -> &'static str {
    if region.lang == "js" { "js" } else { "ts" }
}

pub(crate) fn wrap_compile_source(
    prototype: &CompileTargetPrototype,
    normalized_source: &str,
) -> String {
    if prototype.output_kind == CompileTargetOutputKind::Expression {
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

pub(crate) fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements {
    RuntimeRequirements {
        needs_runtime_i18n_binding: targets.iter().any(|target| {
            target.translation_mode == crate::compile::CompileTranslationMode::Context
                && target.output_kind == CompileTargetOutputKind::Expression
                && !matches!(target.imported_name.as_str(), "msg" | "defineMessage")
        }),
        needs_runtime_trans_component: targets
            .iter()
            .any(|target| target.output_kind == CompileTargetOutputKind::Component),
    }
}

pub(crate) fn create_runtime_bindings(declared_names: &[String]) -> SvelteCompileRuntimeBindings {
    let mut used = declared_names.iter().cloned().collect::<BTreeSet<_>>();

    SvelteCompileRuntimeBindings {
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

pub(super) fn append_runtime_injection_replacements(
    plan: &SvelteCompilePlan,
    source: &str,
    replacements: &mut Vec<CompileReplacement>,
) {
    let runtime_bindings = &plan.runtime_bindings;

    let needs_lingui_context = plan.runtime_requirements.needs_runtime_i18n_binding;
    let needs_trans_component = plan.runtime_requirements.needs_runtime_trans_component;
    if !needs_lingui_context && !needs_trans_component {
        return;
    }

    if let Some(instance_script) = &plan.instance_script {
        let original_script_content =
            &source[instance_script.content_span.start..instance_script.content_span.end];
        let injections = create_runtime_binding_insertions(
            original_script_content,
            runtime_bindings,
            needs_lingui_context,
            needs_trans_component,
        );
        let insertion_start =
            get_script_insertion_start(source, instance_script.content_span.start);

        if !injections.prelude.is_empty() {
            replacements.push(CompileReplacement {
                declaration_id: "__runtime_prelude".to_string(),
                start: insertion_start,
                end: insertion_start,
                code: injections.prelude,
                source_map_json: None,
            });
        }

        if !injections.suffix.is_empty() {
            replacements.push(CompileReplacement {
                declaration_id: "__runtime_suffix".to_string(),
                start: instance_script.content_span.end,
                end: instance_script.content_span.end,
                code: injections.suffix,
                source_map_json: None,
            });
        }

        return;
    }

    let injected = create_runtime_binding_insertions(
        "",
        runtime_bindings,
        needs_lingui_context,
        needs_trans_component,
    );
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

    replacements.push(CompileReplacement {
        declaration_id: "__runtime_script_block".to_string(),
        start: insertion_start,
        end: insertion_start,
        code,
        source_map_json: None,
    });
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
    let window_start = current_start.saturating_sub(pattern.len() + 8);
    let window_end = current_end.min(source.len());
    source[window_start..window_end]
        .match_indices(pattern)
        .map(|(offset, _)| window_start + offset)
        .filter(|start| *start <= current_start)
        .max()
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
) -> RuntimeInsertions {
    let mut prelude = String::new();
    let mut suffix = String::new();

    if include_lingui_context && include_trans_component {
        prelude.push_str(&format!(
            "import {{ RuntimeTrans as {}, createLinguiAccessors as {} }} from \"{}\";\n",
            runtime_bindings.trans_component,
            runtime_bindings.create_lingui_accessors,
            SVELTE_RUNTIME_PACKAGE
        ));
    } else if include_lingui_context {
        prelude.push_str(&format!(
            "import {{ createLinguiAccessors as {} }} from \"{}\";\n",
            runtime_bindings.create_lingui_accessors, SVELTE_RUNTIME_PACKAGE
        ));
    } else if include_trans_component {
        prelude.push_str(&format!(
            "import {{ RuntimeTrans as {} }} from \"{}\";\n",
            runtime_bindings.trans_component, SVELTE_RUNTIME_PACKAGE
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
    RuntimeInsertions {
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
    }
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

pub(crate) fn lower_runtime_component_markup(
    declaration_code: &str,
    runtime_component_name: &str,
) -> Result<String, AnalyzerError> {
    let wrapped = format!("const __lf = {declaration_code};");
    let tree = parse::parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing variable declarator for transformed component".to_string(),
        )
    })?;
    let value = declarator.child_by_field_name("value").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing initializer for transformed component".to_string(),
        )
    })?;

    convert_runtime_trans_root(&wrapped, value, runtime_component_name)
}

fn convert_runtime_trans_root(
    source: &str,
    node: Node<'_>,
    runtime_component_name: &str,
) -> Result<String, AnalyzerError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "expected JSX element initializer for transformed component".to_string(),
        )
    })?;

    let attributes = collect_jsx_attributes(source, opening)?;
    Ok(format!("<{runtime_component_name}{attributes} />"))
}

fn collect_jsx_attributes(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    let mut rendered = String::new();
    let mut cursor = node.walk();
    for child in node.children_by_field_name("attribute", &mut cursor) {
        rendered.push_str(&convert_jsx_attribute(source, child)?);
    }
    Ok(rendered)
}

fn convert_jsx_attribute(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    match node.kind() {
        "jsx_expression" => convert_jsx_spread_attribute(source, node),
        "jsx_attribute" => convert_jsx_named_attribute(source, node),
        other => Err(AnalyzerError::ComponentLoweringFailed(format!(
            "unsupported JSX attribute node kind: {other}"
        ))),
    }
}

fn convert_jsx_spread_attribute(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    let raw_inner = &source[node.start_byte() + 1..node.end_byte() - 1];
    let spread_offset = raw_inner.find("...").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "expected spread element inside JSX spread attribute".to_string(),
        )
    })?;
    let after_spread = &raw_inner[spread_offset + 3..];

    if let Some((prefix, object_text)) = split_prefixed_object_expression(after_spread) {
        let lowered_argument = lower_object_expression_text(object_text)?;
        return Ok(format!(
            " {{...{}{}}}",
            prefix.trim_start(),
            lowered_argument
        ));
    }

    Ok(format!(" {{{raw_inner}}}"))
}

fn convert_jsx_named_attribute(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    let name_node = jsx_attribute_name_node(node).ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed("missing JSX attribute name".to_string())
    })?;
    let value_node = jsx_attribute_value_node(node);
    let name = source_slice(source, name_node);

    let value = match value_node {
        None => "true".to_string(),
        Some(node) if node.kind() == "string" => source_slice(source, node).to_string(),
        Some(node) if node.kind() == "jsx_expression" => {
            let inner = first_named_child(node);
            match inner {
                Some(expression) if name == "components" => {
                    convert_components_expression(source, expression)?
                }
                Some(expression) => {
                    let prefix = &source[node.start_byte() + 1..expression.start_byte()];
                    let suffix = &source[expression.end_byte()..node.end_byte() - 1];
                    format!("{prefix}{}{suffix}", source_slice(source, expression))
                }
                None => String::new(),
            }
        }
        Some(node) if matches!(node.kind(), "jsx_element" | "jsx_self_closing_element") => {
            convert_jsx_element_descriptor(source, node, 0)?
        }
        Some(other) => {
            return Err(AnalyzerError::ComponentLoweringFailed(format!(
                "unsupported JSX attribute value kind: {}",
                other.kind()
            )));
        }
    };

    Ok(format!(" {name}={{{value}}}"))
}

fn convert_expression_for_runtime_trans(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, AnalyzerError> {
    match node.kind() {
        "object" => convert_object_expression(source, node, false, indent_level),
        _ => Ok(source_slice(source, node).to_string()),
    }
}

fn lower_object_expression_text(text: &str) -> Result<String, AnalyzerError> {
    let wrapped = format!("const __expr = ({text});");
    let tree = parse::parse_tsx(&wrapped)?;
    let root = tree.root_node();
    let declarator = find_first_named_descendant(root, "variable_declarator").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing variable declarator while lowering object expression".to_string(),
        )
    })?;
    let value = declarator.child_by_field_name("value").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed("missing object expression initializer".to_string())
    })?;
    let object = if value.kind() == "parenthesized_expression" {
        first_named_child(value).unwrap_or(value)
    } else {
        value
    };
    if object.kind() != "object" {
        return Ok(text.to_string());
    }

    convert_object_expression(&wrapped, object, false, 0)
}

fn convert_components_expression(source: &str, node: Node<'_>) -> Result<String, AnalyzerError> {
    if node.kind() != "object" {
        return Err(AnalyzerError::ComponentLoweringFailed(
            "Runtime Trans components must lower from an object expression".to_string(),
        ));
    }

    convert_object_expression(source, node, true, 0)
}

fn convert_object_expression(
    source: &str,
    node: Node<'_>,
    components_mode: bool,
    indent_level: usize,
) -> Result<String, AnalyzerError> {
    let mut parts = Vec::new();
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut cursor = node.walk();

    for child in node.named_children(&mut cursor) {
        match child.kind() {
            "pair" => {
                let key = child.child_by_field_name("key").ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed("missing object pair key".to_string())
                })?;
                let value = child.child_by_field_name("value").ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed("missing object pair value".to_string())
                })?;
                let key_text = source_slice(source, key);
                let key_name = key_name(source, key);
                let rendered_value = if components_mode {
                    convert_rich_text_component_value(source, value, indent_level + 1)?
                } else if key_name.as_deref() == Some("components") {
                    convert_components_expression(source, value)?
                } else {
                    convert_expression_for_runtime_trans(source, value, indent_level + 1)?
                };
                parts.push(format!("{child_indent}{key_text}: {rendered_value}"));
            }
            "spread_element" => {
                let argument = first_named_child(child).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
                        "missing spread argument in object expression".to_string(),
                    )
                })?;
                let rendered_argument =
                    convert_expression_for_runtime_trans(source, argument, indent_level + 1)?;
                parts.push(format!("{child_indent}...{rendered_argument}"));
            }
            "shorthand_property_identifier" => {
                parts.push(format!("{child_indent}{}", source_slice(source, child)));
            }
            other => {
                return Err(AnalyzerError::ComponentLoweringFailed(format!(
                    "unsupported object child kind in runtime component lowering: {other}"
                )));
            }
        }
    }

    if parts.is_empty() {
        return Ok("{}".to_string());
    }

    Ok(format!("{{\n{}\n{indent}}}", parts.join(",\n")))
}

fn convert_rich_text_component_value(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, AnalyzerError> {
    match node.kind() {
        "jsx_element" | "jsx_self_closing_element" => {
            convert_jsx_element_descriptor(source, node, indent_level)
        }
        _ => Ok(source_slice(source, node).to_string()),
    }
}

fn convert_jsx_element_descriptor(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, AnalyzerError> {
    let opening = match node.kind() {
        "jsx_element" => node.child_by_field_name("open_tag"),
        "jsx_self_closing_element" => Some(node),
        _ => None,
    }
    .ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed("expected JSX element descriptor".to_string())
    })?;

    let name_node = opening.child_by_field_name("name").ok_or_else(|| {
        AnalyzerError::ComponentLoweringFailed(
            "missing JSX name in component descriptor".to_string(),
        )
    })?;
    let props = convert_jsx_attributes_to_object(source, opening, indent_level + 1)?;
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let kind_is_element = is_intrinsic_jsx_name(source, name_node);

    if kind_is_element {
        let tag = source_slice(source, name_node);
        return Ok(format!(
            "{{\n{child_indent}kind: \"element\",\n{child_indent}tag: \"{tag}\",\n{child_indent}props: {props}\n{indent}}}"
        ));
    }

    let component = source_slice(source, name_node);
    Ok(format!(
        "{{\n{child_indent}kind: \"component\",\n{child_indent}component: {component},\n{child_indent}props: {props}\n{indent}}}"
    ))
}

fn convert_jsx_attributes_to_object(
    source: &str,
    node: Node<'_>,
    indent_level: usize,
) -> Result<String, AnalyzerError> {
    let mut parts = Vec::new();
    let indent = "  ".repeat(indent_level);
    let child_indent = "  ".repeat(indent_level + 1);
    let mut cursor = node.walk();

    for child in node.children_by_field_name("attribute", &mut cursor) {
        match child.kind() {
            "jsx_expression" => {
                let spread = first_named_child(child).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
                        "missing spread child in JSX props".to_string(),
                    )
                })?;
                let argument = first_named_child(spread).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed(
                        "missing spread argument in JSX props".to_string(),
                    )
                })?;
                let rendered =
                    convert_expression_for_runtime_trans(source, argument, indent_level + 1)?;
                parts.push(format!("{child_indent}...{rendered}"));
            }
            "jsx_attribute" => {
                let key = jsx_attribute_name_node(child).ok_or_else(|| {
                    AnalyzerError::ComponentLoweringFailed("missing JSX prop name".to_string())
                })?;
                let key_text = source_slice(source, key);
                let value = jsx_attribute_value_node(child);
                let rendered = match value {
                    None => "true".to_string(),
                    Some(value) if value.kind() == "string" => {
                        source_slice(source, value).to_string()
                    }
                    Some(value) if value.kind() == "jsx_expression" => {
                        let expression = first_named_child(value).ok_or_else(|| {
                            AnalyzerError::ComponentLoweringFailed(
                                "missing JSX expression value".to_string(),
                            )
                        })?;
                        convert_expression_for_runtime_trans(source, expression, indent_level + 1)?
                    }
                    Some(value) => source_slice(source, value).to_string(),
                };
                parts.push(format!("{child_indent}{key_text}: {rendered}"));
            }
            other => {
                return Err(AnalyzerError::ComponentLoweringFailed(format!(
                    "unsupported JSX prop kind: {other}"
                )));
            }
        }
    }

    if parts.is_empty() {
        return Ok("{}".to_string());
    }

    Ok(format!("{{\n{}\n{indent}}}", parts.join(",\n")))
}

fn jsx_attribute_name_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("name").or_else(|| {
        node.named_children(&mut node.walk())
            .find(|child| !matches!(child.kind(), "jsx_expression" | "string"))
    })
}

fn jsx_attribute_value_node(node: Node<'_>) -> Option<Node<'_>> {
    node.child_by_field_name("value").or_else(|| {
        let mut found_name = false;
        node.named_children(&mut node.walk()).find(|_| {
            if !found_name {
                found_name = true;
                false
            } else {
                true
            }
        })
    })
}

fn split_prefixed_object_expression(input: &str) -> Option<(&str, &str)> {
    let object_start = input.find('{')?;
    let object_text = &input[object_start..];
    Some((&input[..object_start], object_text))
}

fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    node.named_children(&mut node.walk()).next()
}

fn find_first_named_descendant<'a>(node: Node<'a>, kind: &str) -> Option<Node<'a>> {
    if node.kind() == kind {
        return Some(node);
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if let Some(found) = find_first_named_descendant(child, kind) {
            return Some(found);
        }
    }
    None
}

fn is_forbidden_bare_direct_svelte_macro(candidate: &MacroCandidate) -> bool {
    candidate.strategy == MacroCandidateStrategy::Standalone
        && candidate.flavor == MacroFlavor::Direct
        && matches!(
            candidate.imported_name.as_str(),
            "t" | "plural" | "select" | "selectOrdinal"
        )
}

fn is_intrinsic_jsx_name(source: &str, name: Node<'_>) -> bool {
    source_slice(source, name)
        .chars()
        .next()
        .map(|first| first.is_ascii_lowercase())
        .unwrap_or(false)
}

fn key_name(source: &str, key: Node<'_>) -> Option<String> {
    match key.kind() {
        "property_identifier" | "identifier" => Some(source_slice(source, key).to_string()),
        "string" => {
            Some(source[key.start_byte() + 1..key.end_byte().saturating_sub(1)].to_string())
        }
        _ => None,
    }
}

fn source_slice<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}
