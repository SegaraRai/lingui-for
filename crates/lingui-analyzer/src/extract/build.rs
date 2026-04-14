use std::collections::{BTreeMap, HashSet};

use lean_string::LeanString;

use crate::common::{MappedText, MappedTextError, Span, source_map_to_json};
use crate::extract::{SyntheticMapping, SyntheticModule};
use crate::framework::{MacroCandidate, MacroImport, render_macro_import_line};
use crate::synthesis::{SynthesisPlan, build_synthesis_plan};

#[derive(thiserror::Error, Debug)]
pub enum BuildSyntheticModuleError {
    #[error("duplicate synthetic target declaration_id `{declaration_id}`")]
    DuplicateSyntheticTarget { declaration_id: LeanString },
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
}

pub fn build_synthetic_module(
    source: &LeanString,
    source_name: &LeanString,
    synthetic_name: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
    source_anchors: &[usize],
) -> Result<SyntheticModule, BuildSyntheticModuleError> {
    let plan = build_synthesis_plan(source, source_name, imports, candidates, source_anchors)?;
    build_synthetic_module_from_plan(source, source_name, synthetic_name, &plan, source_anchors)
}

pub fn build_synthetic_module_from_plan(
    source: &LeanString,
    source_name: &LeanString,
    synthetic_name: &str,
    plan: &SynthesisPlan,
    source_anchors: &[usize],
) -> Result<SyntheticModule, BuildSyntheticModuleError> {
    let mut output = MappedText::new(source_name, source);
    let mut declaration_ids = Vec::new();
    let mut seen_declaration_ids = HashSet::with_capacity(plan.targets.len());
    let mut original_spans = BTreeMap::new();
    let mut generated_spans = BTreeMap::new();

    if let Some(line) = render_macro_import_line(&plan.imports) {
        output.push_unmapped_dynamic(line);
        output.push_unmapped("\n");
    }

    for target in &plan.targets {
        let declaration_id = target.declaration_id.clone();
        if !seen_declaration_ids.insert(declaration_id.clone()) {
            return Err(BuildSyntheticModuleError::DuplicateSyntheticTarget { declaration_id });
        }

        let generated_start = output.len();
        output.push_unmapped("const ");
        output.push_unmapped_dynamic(&target.declaration_id);
        output.push_unmapped(" = ");
        output.push(
            &target.normalized_rendered.code,
            target.normalized_rendered.indexed_source_map.clone(),
        );
        output.push_unmapped(";\n");
        let generated_end = output.len();

        declaration_ids.push(declaration_id.clone());
        original_spans.insert(declaration_id.clone(), target.candidate.outer_span);
        generated_spans.insert(
            declaration_id.clone(),
            Span::new(generated_start, generated_end),
        );
    }

    let mappings = plan
        .targets
        .iter()
        .map(|target| SyntheticMapping {
            declaration_id: target.declaration_id.clone(),
            original_span: target.candidate.outer_span,
            generated_span: generated_spans[&target.declaration_id],
            local_name: target.candidate.local_name.clone(),
            imported_name: target.candidate.imported_name.clone(),
            flavor: target.candidate.flavor,
            source_map_anchor: target.candidate.source_map_anchor,
            normalized_segments: target.normalized_segments.clone(),
        })
        .collect();

    let rendered = output.into_rendered()?;
    let source_map_json = rendered
        .indexed_source_map
        .as_ref()
        .and_then(|map| source_map_to_json(map.source_map()));

    Ok(SyntheticModule {
        source: rendered.code,
        source_name: LeanString::from(source_name),
        synthetic_name: LeanString::from(synthetic_name),
        source_map_json: source_map_json.map(LeanString::from),
        source_anchors: source_anchors.to_vec(),
        declaration_ids,
        original_spans,
        generated_spans,
        mappings,
    })
}

#[cfg(test)]
mod tests {
    use lean_string::LeanString;

    use crate::common::{RenderedMappedText, Span};
    use crate::framework::{
        MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor,
    };
    use crate::synthesis::{SynthesisPlan, SynthesisTarget};

    use super::{BuildSyntheticModuleError, build_synthetic_module_from_plan};

    fn ls(text: &str) -> LeanString {
        LeanString::from(text)
    }

    #[test]
    fn rejects_duplicate_synthetic_target_ids() {
        let target = SynthesisTarget {
            declaration_id: ls("__lf_dup"),
            candidate: MacroCandidate {
                id: ls("__mc_0_1"),
                kind: MacroCandidateKind::CallExpression,
                imported_name: ls("t"),
                local_name: ls("t"),
                flavor: MacroFlavor::Direct,
                outer_span: Span::new(0, 1),
                normalized_span: Span::new(0, 1),
                normalization_edits: Vec::new(),
                source_map_anchor: Some(Span::new(0, 1)),
                owner_id: None,
                strategy: MacroCandidateStrategy::Standalone,
            },
            normalized_rendered: RenderedMappedText {
                code: ls("t"),
                indexed_source_map: None,
            },
            normalized_segments: Vec::new(),
        };
        let plan = SynthesisPlan {
            imports: Vec::new(),
            targets: vec![target.clone(), target],
        };

        let source = ls("t");
        let source_name = ls("test.ts");
        let error =
            build_synthetic_module_from_plan(&source, &source_name, "synthetic.ts", &plan, &[])
                .expect_err("duplicate declaration ids should fail");

        assert!(matches!(
            error,
            BuildSyntheticModuleError::DuplicateSyntheticTarget { declaration_id }
            if declaration_id == "__lf_dup"
        ));
    }
}
