mod adapters;
mod emit;
mod lower;
mod plan;
mod runtime_component;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{ScriptLang, Span};
use crate::conventions::FrameworkConventions;
use crate::framework::{MacroCandidate, MacroFlavor, WhitespaceMode};
use crate::synthesis::NormalizedSegment;

pub(crate) use lower::finish_compile;
pub(crate) use plan::build_compile_plan_for_framework;

pub use adapters::{
    AstroCompilePlan, SvelteCompilePlan, SvelteCompileRuntimeBindings, SvelteCompileScriptRegion,
};

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
    Raw,
    Context,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CommonCompilePlan {
    pub source_name: String,
    pub synthetic_name: String,
    pub synthetic_source: String,
    pub synthetic_lang: ScriptLang,
    pub conventions: FrameworkConventions,
    pub declaration_ids: Vec<String>,
    pub targets: Vec<CompileTarget>,
    pub import_removals: Vec<Span>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
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
        source: &str,
        whitespace_mode: WhitespaceMode,
        conventions: &FrameworkConventions,
    ) -> Result<Self::Analysis, crate::AnalyzerError>;

    fn common_analysis(
        analysis: &mut Self::Analysis,
    ) -> &mut adapters::CommonFrameworkCompileAnalysis;

    fn wrap_compile_source(
        analysis: &Self::Analysis,
        prototype: &CompileTargetPrototype,
        normalized_source: &str,
    ) -> String;

    fn repair_compile_targets(source: &str, targets: &mut [CompileTarget]);

    fn compute_runtime_requirements(targets: &[CompileTarget]) -> RuntimeRequirements;

    fn assemble_plan(
        common: CommonCompilePlan,
        runtime_requirements: RuntimeRequirements,
        analysis: Self::Analysis,
    ) -> Self;

    fn common(&self) -> &CommonCompilePlan;

    fn lower_runtime_component_markup(
        &self,
        declaration_code: &str,
    ) -> Result<String, crate::AnalyzerError> {
        Ok(declaration_code.to_string())
    }

    fn append_runtime_injection_replacements(
        &self,
        _source: &str,
        _replacements: &mut Vec<CompileReplacement>,
    ) {
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct CompileReplacement {
    pub declaration_id: String,
    pub start: usize,
    pub end: usize,
    pub code: String,
    pub source_map_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct FinishedCompile {
    pub code: String,
    pub source_name: String,
    pub source_map_json: Option<String>,
    pub replacements: Vec<CompileReplacement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
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
