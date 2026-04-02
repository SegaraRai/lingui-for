mod build;
mod reinsert;

use std::collections::BTreeMap;

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
    pub source: String,
    pub source_name: String,
    pub synthetic_name: String,
    pub source_map_json: Option<String>,
    pub source_anchors: Vec<usize>,
    pub declaration_ids: Vec<String>,
    pub original_spans: BTreeMap<String, Span>,
    pub generated_spans: BTreeMap<String, Span>,
    pub mappings: Vec<SyntheticMapping>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SyntheticModuleOptions {
    pub source: String,
    pub source_name: Option<String>,
    pub synthetic_name: Option<String>,
    pub whitespace: Option<WhitespaceMode>,
    pub conventions: FrameworkConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct ExtractTransformedProgram {
    pub code: String,
    pub source_map_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct ReinsertOptions {
    pub original_source: String,
    pub source_name: Option<String>,
    pub synthetic_module: SyntheticModule,
    pub transformed_program: ExtractTransformedProgram,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct ReinsertedModule {
    pub code: String,
    pub source_name: String,
    pub source_map_json: Option<String>,
}
