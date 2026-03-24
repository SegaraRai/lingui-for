mod adapters;
mod emit;
mod lower;
mod plan;

use serde::{Deserialize, Serialize};

use crate::common::Span;
use crate::framework::{MacroCandidate, MacroFlavor};
use crate::plan::NormalizedSegment;

pub use lower::finish_compile;
pub use plan::{build_compile_plan_for_framework, build_compile_plan_for_framework_with_names};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompileTargetContext {
    ModuleScript,
    InstanceScript,
    Frontmatter,
    Template,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompileTargetOutputKind {
    Expression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CompileTranslationMode {
    Raw,
    Context,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompileTarget {
    pub declaration_id: String,
    pub original_span: Span,
    pub normalized_span: Span,
    pub source_map_anchor: Option<Span>,
    pub local_name: String,
    pub imported_name: String,
    pub flavor: MacroFlavor,
    pub context: CompileTargetContext,
    pub output_kind: CompileTargetOutputKind,
    pub translation_mode: CompileTranslationMode,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RuntimeRequirements {
    pub needs_runtime_i18n_binding: bool,
    pub needs_runtime_trans_component: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct CompileRuntimeBindings {
    pub create_lingui_accessors: String,
    pub context: String,
    pub get_i18n: String,
    pub translate: String,
    pub trans_component: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompileScriptRegion {
    pub outer_span: Span,
    pub content_span: Span,
    pub lang: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct CompilePlan {
    pub framework: String,
    pub source_name: String,
    pub synthetic_name: String,
    pub synthetic_source: String,
    pub synthetic_lang: String,
    pub declaration_ids: Vec<String>,
    pub targets: Vec<CompileTarget>,
    pub runtime_requirements: RuntimeRequirements,
    pub runtime_bindings: Option<CompileRuntimeBindings>,
    pub import_removals: Vec<Span>,
    pub instance_script: Option<CompileScriptRegion>,
    pub module_script: Option<CompileScriptRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompilePlanOptions {
    pub framework: String,
    pub source: String,
    pub source_name: Option<String>,
    pub synthetic_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompileReplacement {
    pub declaration_id: String,
    pub start: usize,
    pub end: usize,
    pub code: String,
    pub source_map_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FinishCompileOptions {
    pub plan: CompilePlan,
    pub source: String,
    pub transformed_programs: TransformedPrograms,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct FinishedCompile {
    pub code: String,
    pub source_name: String,
    pub source_map_json: Option<String>,
    pub replacements: Vec<CompileReplacement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct TransformedPrograms {
    pub raw_code: Option<String>,
    pub raw_source_map_json: Option<String>,
    pub context_code: Option<String>,
    pub context_source_map_json: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct CompileTargetPrototype {
    pub(crate) candidate: MacroCandidate,
    pub(crate) context: CompileTargetContext,
    pub(crate) output_kind: CompileTargetOutputKind,
    pub(crate) translation_mode: CompileTranslationMode,
}
