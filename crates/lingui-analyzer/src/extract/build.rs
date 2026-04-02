use std::collections::{BTreeMap, HashMap};

use crate::common::{
    IndexedSourceMap, MappedText, MappedTextError, Span, build_segmented_map, source_map_to_json,
};
use crate::extract::{SyntheticMapping, SyntheticModule};
use crate::framework::{MacroCandidate, MacroImport, render_macro_import_line};
use crate::synthesis::{SynthesisPlan, SynthesisTarget, build_synthesis_plan};

#[derive(thiserror::Error, Debug)]
pub enum BuildSyntheticModuleError {
    #[error("missing synthetic target: {declaration_id}")]
    MissingSyntheticTarget { declaration_id: String },
    #[error("duplicate synthetic target declaration_id `{declaration_id}`")]
    DuplicateSyntheticTarget { declaration_id: String },
    #[error(transparent)]
    MappedText(#[from] MappedTextError),
}

pub fn build_synthetic_module(
    source: &str,
    source_name: &str,
    synthetic_name: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
    source_anchors: &[usize],
) -> Result<SyntheticModule, BuildSyntheticModuleError> {
    let plan = build_synthesis_plan(source, imports, candidates);
    build_synthetic_module_from_plan(source, source_name, synthetic_name, &plan, source_anchors)
}

pub fn build_synthetic_module_from_plan(
    source: &str,
    source_name: &str,
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
        out.push_str(&line);
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
            let target = targets_by_id.get(id.as_str()).copied().ok_or_else(|| {
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
        import_line.as_deref(),
        &targets_by_id,
        &declaration_ids,
        source_anchors,
    )?
    .as_ref()
    .and_then(|map| source_map_to_json(map.source_map()));

    Ok(SyntheticModule {
        source: out,
        source_name: source_name.to_string(),
        synthetic_name: synthetic_name.to_string(),
        source_map_json,
        source_anchors: source_anchors.to_vec(),
        declaration_ids,
        original_spans,
        generated_spans,
        mappings,
    })
}

fn build_targets_by_id<'a>(
    plan: &'a SynthesisPlan,
) -> Result<HashMap<&'a str, &'a SynthesisTarget>, BuildSyntheticModuleError> {
    let mut targets_by_id = HashMap::with_capacity(plan.targets.len());
    for target in &plan.targets {
        let declaration_id = target.declaration_id.as_str();
        if targets_by_id.insert(declaration_id, target).is_some() {
            return Err(BuildSyntheticModuleError::DuplicateSyntheticTarget {
                declaration_id: target.declaration_id.clone(),
            });
        }
    }
    Ok(targets_by_id)
}

fn build_synthetic_source_map(
    source: &str,
    source_name: &str,
    import_line: Option<&str>,
    targets_by_id: &HashMap<&str, &SynthesisTarget>,
    declaration_ids: &[String],
    source_anchors: &[usize],
) -> Result<Option<IndexedSourceMap>, BuildSyntheticModuleError> {
    let mut mapped = MappedText::new(source_name, source);

    if let Some(line) = import_line {
        mapped.push_unmapped(line);
        mapped.push_unmapped("\n");
    }

    for declaration_id in declaration_ids {
        let Some(target) = targets_by_id.get(declaration_id.as_str()).copied() else {
            return Err(BuildSyntheticModuleError::MissingSyntheticTarget {
                declaration_id: declaration_id.clone(),
            });
        };
        let declaration_map = build_segmented_map(
            source_name,
            source,
            &target.normalized_code,
            &target.normalized_segments,
            source_anchors,
        )?;

        mapped.push_unmapped("const ");
        mapped.push_unmapped(&target.declaration_id);
        mapped.push_unmapped(" = ");
        if let Some(map) = declaration_map {
            mapped.push_pre_mapped(&target.normalized_code, map);
        } else {
            mapped.push_unmapped(&target.normalized_code);
        }
        mapped.push_unmapped(";\n");
    }

    mapped
        .into_rendered()
        .map(|rendered| rendered.indexed_source_map)
        .map_err(BuildSyntheticModuleError::from)
}

#[cfg(test)]
mod tests {
    use crate::common::Span;
    use crate::framework::{
        MacroCandidate, MacroCandidateKind, MacroCandidateStrategy, MacroFlavor,
    };
    use crate::synthesis::{SynthesisPlan, SynthesisTarget};

    use super::{BuildSyntheticModuleError, build_synthetic_module_from_plan};

    #[test]
    fn rejects_duplicate_synthetic_target_ids() {
        let target = SynthesisTarget {
            declaration_id: "__lf_dup".to_string(),
            candidate: MacroCandidate {
                id: "__mc_0_1".to_string(),
                kind: MacroCandidateKind::CallExpression,
                imported_name: "t".to_string(),
                local_name: "t".to_string(),
                flavor: MacroFlavor::Direct,
                outer_span: Span::new(0, 1),
                normalized_span: Span::new(0, 1),
                normalization_edits: Vec::new(),
                source_map_anchor: Some(Span::new(0, 1)),
                owner_id: None,
                strategy: MacroCandidateStrategy::Standalone,
            },
            normalized_code: "t".to_string(),
            normalized_segments: Vec::new(),
        };
        let plan = SynthesisPlan {
            imports: Vec::new(),
            targets: vec![target.clone(), target],
        };

        let error = build_synthetic_module_from_plan("t", "test.ts", "synthetic.ts", &plan, &[])
            .expect_err("duplicate declaration ids should fail");

        assert!(matches!(
            error,
            BuildSyntheticModuleError::DuplicateSyntheticTarget { declaration_id }
            if declaration_id == "__lf_dup"
        ));
    }
}
