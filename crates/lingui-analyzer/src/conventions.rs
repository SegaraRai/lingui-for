use std::collections::BTreeMap;

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(thiserror::Error, Debug, Clone, PartialEq, Eq)]
pub enum MacroConventionsError {
    #[error("framework conventions are missing macro package kind `{kind}`")]
    MissingMacroPackageKind { kind: &'static str },
}

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
pub struct MacroPackage {
    pub packages: Vec<LeanString>,
}

impl MacroPackage {
    pub fn contains(&self, specifier: &str) -> bool {
        self.packages.iter().any(|candidate| candidate == specifier)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroPackageKind {
    Core,
    React,
    Svelte,
    Astro,
}

impl MacroPackageKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Core => "core",
            Self::React => "react",
            Self::Svelte => "svelte",
            Self::Astro => "astro",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct MacroConventions {
    pub packages: BTreeMap<MacroPackageKind, MacroPackage>,
}

impl MacroConventions {
    pub fn accepts_package(&self, specifier: &str) -> bool {
        self.packages
            .values()
            .any(|package_group| package_group.contains(specifier))
    }

    pub fn package_kind(&self, specifier: &str) -> Option<MacroPackageKind> {
        self.packages
            .iter()
            .find_map(|(kind, package_group)| package_group.contains(specifier).then_some(*kind))
    }

    pub fn package(&self, kind: MacroPackageKind) -> Option<&MacroPackage> {
        self.packages.get(&kind)
    }

    pub fn required_package(
        &self,
        kind: MacroPackageKind,
    ) -> Result<&MacroPackage, MacroConventionsError> {
        self.package(kind)
            .ok_or(MacroConventionsError::MissingMacroPackageKind {
                kind: kind.as_str(),
            })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExportConventions {
    pub trans: LeanString,
    #[tsify(optional)]
    pub i18n_accessor: Option<LeanString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConventions {
    pub package: LeanString,
    pub exports: RuntimeExportConventions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBindingSeeds {
    #[tsify(optional)]
    pub i18n_accessor_factory: Option<LeanString>,
    #[tsify(optional)]
    pub context: Option<LeanString>,
    #[tsify(optional)]
    pub get_i18n: Option<LeanString>,
    #[tsify(optional)]
    pub translate: Option<LeanString>,
    #[tsify(optional)]
    pub i18n_instance: Option<LeanString>,
    #[tsify(optional)]
    pub reactive_translation_wrapper: Option<LeanString>,
    #[tsify(optional)]
    pub eager_translation_wrapper: Option<LeanString>,
    pub runtime_trans_component: LeanString,
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
}

impl FrameworkConventions {
    pub fn accepts_macro_package(&self, specifier: &str) -> bool {
        self.macro_.accepts_package(specifier)
    }
}
