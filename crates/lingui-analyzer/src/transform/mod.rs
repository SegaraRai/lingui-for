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

pub(crate) use lower::finish_transform;
pub(crate) use plan::build_transform_plan_for_framework;

pub use adapters::{
    AdapterError, AstroTransformPlan, SvelteTransformPlan, SvelteTransformRuntimeBindings,
    SvelteTransformScriptRegion,
};
pub use emit::EmitError;
pub use lower::LowerError;
pub use runtime_component::RuntimeComponentError;

#[derive(thiserror::Error, Debug)]
pub enum TransformError {
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
pub enum TransformTargetContext {
    ModuleScript,
    InstanceScript,
    Frontmatter,
    Template,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum TransformTargetOutputKind {
    Expression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum TransformTranslationMode {
    Lowered,
    Contextual,
}

/// Controls whether a class of generated runtime warnings is emitted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify, Default)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum RuntimeWarningMode {
    /// Suppresses the warning in generated runtime helpers.
    Off,
    /// Emits the warning in generated runtime helpers.
    #[default]
    On,
}

/// Runtime warning switches used while generating framework runtime helpers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify, Default)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeWarningOptions {
    /// Controls warnings for rich-text `<Trans>` content holes that ignore translated children.
    #[serde(default)]
    pub trans_content_override: RuntimeWarningMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CommonTransformPlan {
    pub source_name: LeanString,
    pub synthetic_name: LeanString,
    pub synthetic_source: LeanString,
    pub synthetic_source_map_json: Option<LeanString>,
    pub source_anchors: Vec<usize>,
    pub synthetic_lang: ScriptLang,
    pub conventions: FrameworkConventions,
    pub declaration_ids: Vec<LeanString>,
    pub targets: Vec<TransformTarget>,
    pub import_removals: Vec<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct TransformTarget {
    pub declaration_id: LeanString,
    pub original_span: Span,
    pub normalized_span: Span,
    pub source_map_anchor: Option<Span>,
    pub local_name: LeanString,
    pub imported_name: LeanString,
    pub flavor: MacroFlavor,
    pub context: TransformTargetContext,
    pub output_kind: TransformTargetOutputKind,
    pub translation_mode: TransformTranslationMode,
    pub normalized_segments: Vec<NormalizedSegment>,
    pub runtime_component_wrapper_spans: Vec<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRequirements {
    pub needs_runtime_i18n_binding: bool,
    pub needs_runtime_trans_component: bool,
}

pub(crate) trait FrameworkTransformPlan: Sized {
    type Analysis;

    fn analyze(
        source: &LeanString,
        source_name: &LeanString,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, TransformError>;

    fn common_analysis(
        analysis: &mut Self::Analysis,
    ) -> &mut adapters::CommonFrameworkTransformAnalysis;

    fn wrap_transform_source(
        analysis: &Self::Analysis,
        prototype: &TransformTargetPrototype,
        normalized_source: &RenderedMappedText,
    ) -> Result<RenderedMappedText, TransformError>;

    fn compute_runtime_requirements(targets: &[TransformTarget]) -> RuntimeRequirements;

    fn assemble_plan(
        common: CommonTransformPlan,
        runtime_requirements: RuntimeRequirements,
        runtime_warnings: RuntimeWarningOptions,
        analysis: Self::Analysis,
    ) -> Self;

    fn common(&self) -> &CommonTransformPlan;

    fn lower_runtime_component_markup(
        &self,
        _source_name: &LeanString,
        _source: &LeanString,
        _target: &TransformTarget,
        declaration: &RenderedMappedText,
    ) -> Result<RenderedMappedText, AdapterError>;

    fn append_runtime_injection_replacements(
        &self,
        _source: &LeanString,
        _replacements: &mut Vec<TransformReplacementInternal>,
    ) -> Result<(), AdapterError> {
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TransformReplacementInternal {
    pub(crate) declaration_id: LeanString,
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: LeanString,
    pub(crate) indexed_source_map: Option<IndexedSourceMap>,
    pub(crate) original_anchors: Vec<usize>,
}

impl TransformReplacementInternal {
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
pub struct TransformReplacement {
    pub declaration_id: LeanString,
    pub start: usize,
    pub end: usize,
    pub code: LeanString,
    pub source_map_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct FinishedTransform {
    pub code: LeanString,
    pub source_name: LeanString,
    pub source_map_json: Option<String>,
    pub replacements: Vec<TransformReplacement>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TransformReplacementOutputInternal {
    pub(crate) declaration_id: LeanString,
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: LeanString,
    pub(crate) indexed_source_map: Option<IndexedSourceMap>,
}

impl From<TransformReplacementInternal> for TransformReplacementOutputInternal {
    fn from(value: TransformReplacementInternal) -> Self {
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
pub(crate) struct FinishedTransformInternal {
    pub(crate) code: LeanString,
    pub(crate) source_name: LeanString,
    pub(crate) source_map: Option<IndexedSourceMap>,
    pub(crate) replacements: Vec<TransformReplacementOutputInternal>,
}

impl FinishedTransformInternal {
    pub(crate) fn into_public(self) -> FinishedTransform {
        FinishedTransform {
            code: self.code,
            source_name: self.source_name,
            source_map_json: self
                .source_map
                .as_ref()
                .and_then(|map| source_map_to_json(map.source_map())),
            replacements: self
                .replacements
                .into_iter()
                .map(|replacement| TransformReplacement {
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
pub(crate) struct TransformTargetPrototype {
    pub(crate) candidate: MacroCandidate,
    pub(crate) context: TransformTargetContext,
    pub(crate) output_kind: TransformTargetOutputKind,
    pub(crate) translation_mode: TransformTranslationMode,
}
