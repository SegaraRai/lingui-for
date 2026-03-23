use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tree_sitter::Node;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

impl Span {
    pub const fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    pub fn from_node(node: Node<'_>) -> Self {
        Self::new(node.start_byte(), node.end_byte())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EmbeddedScriptKind {
    Frontmatter,
    Script,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbeddedScriptRegion {
    pub kind: EmbeddedScriptKind,
    pub outer_span: Span,
    pub inner_span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroImport {
    pub source: String,
    pub imported_name: String,
    pub local_name: String,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacroCandidateKind {
    CallExpression,
    TaggedTemplateExpression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacroFlavor {
    Direct,
    Reactive,
    Eager,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacroCandidateStrategy {
    Standalone,
    OwnedByParent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroCandidate {
    pub id: String,
    pub kind: MacroCandidateKind,
    pub imported_name: String,
    pub local_name: String,
    pub flavor: MacroFlavor,
    pub outer_span: Span,
    pub normalized_span: Span,
    pub strip_spans: Vec<Span>,
    pub source_map_anchor: Option<Span>,
    pub owner_id: Option<String>,
    pub strategy: MacroCandidateStrategy,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct SyntheticModule {
    pub source: String,
    pub source_name: String,
    pub synthetic_name: String,
    pub source_map_json: Option<String>,
    pub declaration_ids: Vec<String>,
    pub original_spans: BTreeMap<String, Span>,
    pub generated_spans: BTreeMap<String, Span>,
    pub mappings: Vec<SyntheticMapping>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyntheticModuleOptions {
    pub framework: String,
    pub source: String,
    pub source_name: Option<String>,
    pub synthetic_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyntheticMapping {
    pub declaration_id: String,
    pub original_span: Span,
    pub generated_span: Span,
    pub local_name: String,
    pub imported_name: String,
    pub flavor: MacroFlavor,
    pub source_map_anchor: Option<Span>,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedSegment {
    pub original_start: usize,
    pub generated_start: usize,
    pub len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplacementChunk {
    pub declaration_id: String,
    pub original_span: Span,
    pub replacement: String,
    pub source_map_anchor: Option<Span>,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReinsertOptions {
    pub original_source: String,
    pub source_name: Option<String>,
    pub synthetic_module: SyntheticModule,
    pub transformed_declarations: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ReinsertedModule {
    pub code: String,
    pub source_name: String,
    pub source_map_json: Option<String>,
}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompileTranslationMode {
    Raw,
    SvelteContext,
    AstroContext,
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
    pub transformed_declarations: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct FinishedCompile {
    pub replacements: Vec<CompileReplacement>,
}
