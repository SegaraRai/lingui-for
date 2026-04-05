mod adapters;
mod emit;
mod lower;
mod plan;
mod runtime_component;

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{
    IndexedSourceMap, MappedTextError, RenderedMappedText, ScriptLang, Span, source_map_to_json,
};
use crate::conventions::FrameworkConventions;
use crate::framework::{MacroCandidate, MacroFlavor, WhitespaceMode};
use crate::synthesis::NormalizedSegment;

pub(crate) use lower::finish_compile;
pub(crate) use plan::build_compile_plan_for_framework;

pub use adapters::{
    AdapterError, AstroCompilePlan, SvelteCompilePlan, SvelteCompileRuntimeBindings,
    SvelteCompileScriptRegion,
};
pub use emit::EmitError;
pub use lower::LowerError;
pub use runtime_component::RuntimeComponentError;

#[derive(thiserror::Error, Debug)]
pub enum CompileError {
    #[error(transparent)]
    Adapter(#[from] AdapterError),
    #[error(transparent)]
    Lower(#[from] LowerError),
    #[error(transparent)]
    Emit(#[from] EmitError),
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum CompileTargetContext {
    ModuleScript,
    InstanceScript,
    Frontmatter,
    Template,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum CompileTargetOutputKind {
    Expression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum CompileTranslationMode {
    Lowered,
    Contextual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify, Default)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum RuntimeWarningMode {
    Off,
    #[default]
    On,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeWarningOptions {
    pub trans_content_override: RuntimeWarningMode,
}

impl Default for RuntimeWarningOptions {
    fn default() -> Self {
        Self {
            trans_content_override: RuntimeWarningMode::On,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CommonCompilePlan {
    pub source_name: LeanString,
    pub synthetic_name: LeanString,
    pub synthetic_source: LeanString,
    pub synthetic_source_map_json: Option<LeanString>,
    pub source_anchors: Vec<usize>,
    pub synthetic_lang: ScriptLang,
    pub conventions: FrameworkConventions,
    pub declaration_ids: Vec<LeanString>,
    pub targets: Vec<CompileTarget>,
    pub import_removals: Vec<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CompileTarget {
    pub declaration_id: LeanString,
    pub original_span: Span,
    pub normalized_span: Span,
    pub source_map_anchor: Option<Span>,
    pub local_name: LeanString,
    pub imported_name: LeanString,
    pub flavor: MacroFlavor,
    pub context: CompileTargetContext,
    pub output_kind: CompileTargetOutputKind,
    pub translation_mode: CompileTranslationMode,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRequirements {
    pub needs_runtime_i18n_binding: bool,
    pub needs_runtime_trans_component: bool,
}

pub(crate) trait FrameworkCompilePlan: Sized {
    type Analysis;

    fn analyze(
        source: &LeanString,
        source_name: &LeanString,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, CompileError>;

    fn common_analysis(
        analysis: &mut Self::Analysis,
    ) -> &mut adapters::CommonFrameworkCompileAnalysis;

    fn wrap_compile_source(
        analysis: &Self::Analysis,
        prototype: &CompileTargetPrototype,
        normalized_source: &RenderedMappedText,
    ) -> Result<RenderedMappedText, CompileError>;

    fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements;

    fn assemble_plan(
        common: CommonCompilePlan,
        runtime_requirements: RuntimeRequirements,
        runtime_warnings: RuntimeWarningOptions,
        analysis: Self::Analysis,
    ) -> Self;

    fn common(&self) -> &CommonCompilePlan;

    fn lower_runtime_component_markup(
        &self,
        _source_name: &LeanString,
        _source: &LeanString,
        _target: &CompileTarget,
        declaration: &RenderedMappedText,
    ) -> Result<RenderedMappedText, AdapterError>;

    fn append_runtime_injection_replacements(
        &self,
        _source: &LeanString,
        _replacements: &mut Vec<CompileReplacementInternal>,
    ) -> Result<(), AdapterError> {
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompileReplacementInternal {
    pub(crate) declaration_id: LeanString,
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: LeanString,
    pub(crate) indexed_source_map: Option<IndexedSourceMap>,
    pub(crate) original_anchors: Vec<usize>,
}

impl CompileReplacementInternal {
    pub(crate) fn new(
        declaration_id: LeanString,
        start: usize,
        end: usize,
        code: LeanString,
        indexed_source_map: Option<IndexedSourceMap>,
        original_anchors: Vec<usize>,
    ) -> Self {
        Self {
            declaration_id,
            start,
            end,
            code,
            indexed_source_map,
            original_anchors,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CompileReplacement {
    pub declaration_id: LeanString,
    pub start: usize,
    pub end: usize,
    pub code: LeanString,
    pub source_map_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct FinishedCompile {
    pub code: LeanString,
    pub source_name: LeanString,
    pub source_map_json: Option<String>,
    pub replacements: Vec<CompileReplacement>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompileReplacementOutputInternal {
    pub(crate) declaration_id: LeanString,
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: LeanString,
    pub(crate) indexed_source_map: Option<IndexedSourceMap>,
}

impl From<CompileReplacementInternal> for CompileReplacementOutputInternal {
    fn from(value: CompileReplacementInternal) -> Self {
        Self {
            declaration_id: value.declaration_id,
            start: value.start,
            end: value.end,
            code: value.code,
            indexed_source_map: value.indexed_source_map,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FinishedCompileInternal {
    pub(crate) code: LeanString,
    pub(crate) source_name: LeanString,
    pub(crate) source_map: Option<IndexedSourceMap>,
    pub(crate) replacements: Vec<CompileReplacementOutputInternal>,
}

impl FinishedCompileInternal {
    pub(crate) fn into_public(self) -> FinishedCompile {
        FinishedCompile {
            code: self.code,
            source_name: self.source_name,
            source_map_json: self
                .source_map
                .as_ref()
                .and_then(|map| source_map_to_json(map.source_map())),
            replacements: self
                .replacements
                .into_iter()
                .map(|replacement| CompileReplacement {
                    declaration_id: replacement.declaration_id,
                    start: replacement.start,
                    end: replacement.end,
                    code: replacement.code,
                    source_map_json: replacement
                        .indexed_source_map
                        .as_ref()
                        .and_then(|map| source_map_to_json(map.source_map())),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct TransformedPrograms {
    pub lowered_code: Option<LeanString>,
    pub lowered_source_map_json: Option<LeanString>,
    pub contextual_code: Option<LeanString>,
    pub contextual_source_map_json: Option<LeanString>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CompileTargetPrototype {
    pub(crate) candidate: MacroCandidate,
    pub(crate) context: CompileTargetContext,
    pub(crate) output_kind: CompileTargetOutputKind,
    pub(crate) translation_mode: CompileTranslationMode,
}
