use std::collections::{BTreeMap, HashMap};

use lean_string::LeanString;

use crate::common::{IndexedSourceMap, MappedText, MappedTextError, Span, source_map_to_json};
use crate::extract::{SyntheticMapping, SyntheticModule};
use crate::framework::{MacroCandidate, MacroImport, render_macro_import_line};
use crate::synthesis::{SynthesisPlan, SynthesisTarget, build_synthesis_plan};

#[derive(thiserror::Error, Debug)]
pub enum BuildSyntheticModuleError {
    #[error("missing synthetic target: {declaration_id}")]
    MissingSyntheticTarget { declaration_id: LeanString },
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
    let mut out = String::new();
    let mut declaration_ids = Vec::new();
    let targets_by_id = build_targets_by_id(plan)?;
    let mut original_spans = BTreeMap::new();
    let mut generated_spans = BTreeMap::new();
    let mut normalized_segments = BTreeMap::new();
    let mut source_map_anchors = BTreeMap::new();
    let import_line = render_macro_import_line(&plan.imports);

    if let Some(line) = import_line.as_deref() {
        out.push_str(line);
        out.push('\n');
    }

    for target in &plan.targets {
        let declaration_id = target.declaration_id.clone();
        let generated_start = out.len();
        out.push_str("const ");
        out.push_str(&declaration_id);
        out.push_str(" = ");
        out.push_str(&target.normalized_code);
        out.push_str(";\n");
        let generated_end = out.len();

        declaration_ids.push(declaration_id.clone());
        original_spans.insert(declaration_id.clone(), target.candidate.outer_span);
        generated_spans.insert(
            declaration_id.clone(),
            Span::new(generated_start, generated_end),
        );
        normalized_segments.insert(declaration_id.clone(), target.normalized_segments.clone());
        source_map_anchors.insert(declaration_id.clone(), target.candidate.source_map_anchor);
    }

    let mappings = declaration_ids
        .iter()
        .map(|id| {
            let target = targets_by_id.get(id).copied().ok_or_else(|| {
                BuildSyntheticModuleError::MissingSyntheticTarget {
                    declaration_id: id.clone(),
                }
            })?;
            Ok(SyntheticMapping {
                declaration_id: id.clone(),
                original_span: original_spans[id],
                generated_span: generated_spans[id],
                local_name: target.candidate.local_name.clone(),
                imported_name: target.candidate.imported_name.clone(),
                flavor: target.candidate.flavor,
                source_map_anchor: source_map_anchors[id],
                normalized_segments: normalized_segments[id].clone(),
            })
        })
        .collect::<Result<_, BuildSyntheticModuleError>>()?;

    let source_map_json = build_synthetic_source_map(
        source,
        source_name,
        import_line.as_ref(),
        &targets_by_id,
        &declaration_ids,
        source_anchors,
    )?
    .as_ref()
    .and_then(|map| source_map_to_json(map.source_map()));

    Ok(SyntheticModule {
        source: LeanString::from(out),
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

fn build_targets_by_id(
    plan: &SynthesisPlan,
) -> Result<HashMap<&LeanString, &SynthesisTarget>, BuildSyntheticModuleError> {
    let mut targets_by_id = HashMap::with_capacity(plan.targets.len());
    for target in &plan.targets {
        let declaration_id = &target.declaration_id;
        if targets_by_id.insert(declaration_id, target).is_some() {
            return Err(BuildSyntheticModuleError::DuplicateSyntheticTarget {
                declaration_id: target.declaration_id.clone(),
            });
        }
    }
    Ok(targets_by_id)
}

fn build_synthetic_source_map(
    source: &LeanString,
    source_name: &LeanString,
    import_line: Option<&LeanString>,
    targets_by_id: &HashMap<&LeanString, &SynthesisTarget>,
    declaration_ids: &[LeanString],
    _source_anchors: &[usize],
) -> Result<Option<IndexedSourceMap>, BuildSyntheticModuleError> {
    let mut mapped = MappedText::new(source_name, source);

    if let Some(line) = import_line {
        mapped.push_unmapped_dynamic(line);
        mapped.push_unmapped("\n");
    }

    for declaration_id in declaration_ids {
        let target = targets_by_id.get(declaration_id).copied().ok_or_else(|| {
            BuildSyntheticModuleError::MissingSyntheticTarget {
                declaration_id: declaration_id.clone(),
            }
        })?;
        let declaration_map = target.normalized_rendered.indexed_source_map.clone();

        mapped.push_unmapped("const ");
        mapped.push_unmapped_dynamic(&target.declaration_id);
        mapped.push_unmapped(" = ");
        mapped.push(&target.normalized_code, declaration_map);
        mapped.push_unmapped(";\n");
    }

    mapped
        .into_rendered()
        .map(|rendered| rendered.indexed_source_map)
        .map_err(BuildSyntheticModuleError::from)
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
            normalized_code: ls("t"),
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
