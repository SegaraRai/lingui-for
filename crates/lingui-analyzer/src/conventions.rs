use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum FrameworkKind {
    Astro,
    Svelte,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct MacroConventions {
    pub primary_package: String,
    pub accepted_packages: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExportConventions {
    pub trans: String,
    #[tsify(optional)]
    pub i18n_accessor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConventions {
    pub package: String,
    pub exports: RuntimeExportConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBindingSeeds {
    #[tsify(optional)]
    pub i18n_accessor_factory: Option<String>,
    #[tsify(optional)]
    pub context: Option<String>,
    #[tsify(optional)]
    pub get_i18n: Option<String>,
    #[tsify(optional)]
    pub translate: Option<String>,
    #[tsify(optional)]
    pub i18n_instance: Option<String>,
    pub runtime_trans_component: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct SyntheticConventions {
    #[tsify(optional)]
    pub expression_prefix: Option<String>,
    #[tsify(optional)]
    pub component_prefix: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct WrapperConventions {
    #[tsify(optional)]
    pub reactive_translation: Option<String>,
    #[tsify(optional)]
    pub eager_translation: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct FrameworkConventions {
    pub framework: FrameworkKind,
    #[serde(rename = "macro")]
    pub macro_: MacroConventions,
    pub runtime: RuntimeConventions,
    pub bindings: RuntimeBindingSeeds,
    #[tsify(optional)]
    pub synthetic: Option<SyntheticConventions>,
    #[tsify(optional)]
    pub wrappers: Option<WrapperConventions>,
}

impl FrameworkConventions {
    pub fn accepts_macro_package(&self, specifier: &str) -> bool {
        self.macro_
            .accepted_packages
            .iter()
            .any(|candidate| candidate == specifier)
    }
}
