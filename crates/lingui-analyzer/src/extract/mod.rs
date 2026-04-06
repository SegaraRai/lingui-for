mod build;
mod reinsert;

use std::collections::BTreeMap;

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::Span;
use crate::conventions::FrameworkConventions;
use crate::framework::{MacroFlavor, WhitespaceMode};
use crate::synthesis::NormalizedSegment;

pub use build::{BuildSyntheticModuleError, build_synthetic_module};
pub use reinsert::{ReinsertError, reinsert_transformed_declarations};

#[derive(thiserror::Error, Debug)]
pub enum ExtractError {
    #[error(transparent)]
    BuildSyntheticModule(#[from] BuildSyntheticModuleError),
    #[error(transparent)]
    Reinsert(#[from] ReinsertError),
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SyntheticModule {
    pub source: LeanString,
    pub source_name: LeanString,
    pub synthetic_name: LeanString,
    pub source_map_json: Option<LeanString>,
    pub source_anchors: Vec<usize>,
    pub declaration_ids: Vec<LeanString>,
    pub original_spans: BTreeMap<LeanString, Span>,
    pub generated_spans: BTreeMap<LeanString, Span>,
    pub mappings: Vec<SyntheticMapping>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SyntheticMapping {
    pub declaration_id: LeanString,
    pub original_span: Span,
    pub generated_span: Span,
    pub local_name: LeanString,
    pub imported_name: LeanString,
    pub flavor: MacroFlavor,
    pub source_map_anchor: Option<Span>,
    pub normalized_segments: Vec<NormalizedSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SyntheticModuleOptions {
    pub source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_name: Option<LeanString>,
    pub whitespace: Option<WhitespaceMode>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct ExtractTransformedProgram {
    pub code: LeanString,
    pub source_map_json: Option<LeanString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct ReinsertOptions {
    pub original_source: LeanString,
    pub source_name: Option<LeanString>,
    pub synthetic_module: SyntheticModule,
    pub transformed_program: ExtractTransformedProgram,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct ReinsertedModule {
    pub code: LeanString,
    pub source_name: LeanString,
    pub source_map_json: Option<LeanString>,
}
