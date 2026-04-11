pub mod astro;
pub(crate) mod shared;
pub mod svelte;

use std::collections::{BTreeMap, BTreeSet};

use lean_string::LeanString;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::common::{NormalizationEdit, Span};
use crate::conventions::FrameworkConventions;
use crate::syntax::parse::ParseError;

pub use astro::AstroFrameworkError;
pub use shared::js::JsAnalysisError;
pub use svelte::SvelteFrameworkError;

#[derive(thiserror::Error, Debug)]
pub enum FrameworkError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Js(#[from] JsAnalysisError),
    #[error(transparent)]
    Astro(#[from] AstroFrameworkError),
    #[error(transparent)]
    Svelte(#[from] SvelteFrameworkError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct MacroImport {
    pub source: LeanString,
    pub imported_name: LeanString,
    pub local_name: LeanString,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroCandidateKind {
    CallExpression,
    TaggedTemplateExpression,
    Component,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroFlavor {
    Direct,
    Reactive,
    Eager,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum MacroCandidateStrategy {
    Standalone,
    OwnedByParent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum WhitespaceMode {
    Jsx,
    Astro,
    Svelte,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum AstroWhitespaceMode {
    Jsx,
    Astro,
}

impl From<AstroWhitespaceMode> for WhitespaceMode {
    fn from(value: AstroWhitespaceMode) -> Self {
        match value {
            AstroWhitespaceMode::Jsx => WhitespaceMode::Jsx,
            AstroWhitespaceMode::Astro => WhitespaceMode::Astro,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub enum SvelteWhitespaceMode {
    Jsx,
    Svelte,
}

impl From<SvelteWhitespaceMode> for WhitespaceMode {
    fn from(value: SvelteWhitespaceMode) -> Self {
        match value {
            SvelteWhitespaceMode::Jsx => WhitespaceMode::Jsx,
            SvelteWhitespaceMode::Svelte => WhitespaceMode::Svelte,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct MacroCandidate {
    pub id: LeanString,
    pub kind: MacroCandidateKind,
    pub imported_name: LeanString,
    pub local_name: LeanString,
    pub flavor: MacroFlavor,
    pub outer_span: Span,
    pub normalized_span: Span,
    pub normalization_edits: Vec<NormalizationEdit>,
    pub source_map_anchor: Option<Span>,
    pub owner_id: Option<LeanString>,
    pub strategy: MacroCandidateStrategy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify()]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeOptions {
    pub source_name: LeanString,
    pub whitespace: WhitespaceMode,
    pub conventions: FrameworkConventions,
}

pub trait FrameworkAdapter {
    type Analysis;

    fn analyze(
        &self,
        source: &str,
        options: &AnalyzeOptions,
    ) -> Result<Self::Analysis, FrameworkError>;
}

pub(crate) fn render_macro_import_line(imports: &[MacroImport]) -> Option<LeanString> {
    let mut grouped = BTreeMap::<&str, BTreeSet<(&str, &str)>>::new();
    for import_decl in imports {
        grouped
            .entry(import_decl.source.as_str())
            .or_default()
            .insert((
                import_decl.imported_name.as_str(),
                import_decl.local_name.as_str(),
            ));
    }

    if grouped.is_empty() {
        return None;
    }

    let rendered = grouped
        .into_iter()
        .map(|(source, specifiers)| {
            let rendered = specifiers
                .into_iter()
                .map(|(imported_name, local_name)| {
                    if imported_name == local_name {
                        local_name.to_string()
                    } else {
                        format!("{imported_name} as {local_name}")
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("import {{ {rendered} }} from \"{source}\";")
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(LeanString::from(rendered))
}
