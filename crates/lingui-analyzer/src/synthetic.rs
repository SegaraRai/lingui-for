use std::collections::BTreeMap;

use crate::{MacroCandidate, MacroImport, Span, SyntheticMapping, SyntheticModule};

pub fn build_synthetic_module(
    source: &str,
    imports: &[MacroImport],
    candidates: &[MacroCandidate],
) -> SyntheticModule {
    let mut out = String::new();
    let mut declaration_ids = Vec::new();
    let mut original_spans = BTreeMap::new();
    let mut generated_spans = BTreeMap::new();
    let import_line = render_import_line(imports);

    if let Some(line) = import_line {
        out.push_str(&line);
        out.push('\n');
    }

    for (index, candidate) in candidates.iter().enumerate() {
        let declaration_id = format!("__lf_{index}");
        let normalized = normalize_candidate_source(source, candidate);
        let generated_start = out.len();
        out.push_str("const ");
        out.push_str(&declaration_id);
        out.push_str(" = ");
        out.push_str(&normalized);
        out.push_str(";\n");
        let generated_end = out.len();

        declaration_ids.push(declaration_id.clone());
        original_spans.insert(declaration_id.clone(), candidate.outer_span);
        generated_spans.insert(
            declaration_id.clone(),
            Span::new(generated_start, generated_end),
        );
    }

    let mappings = declaration_ids
        .iter()
        .map(|id| SyntheticMapping {
            declaration_id: id.clone(),
            original_span: original_spans[id],
            generated_span: generated_spans[id],
        })
        .collect();

    SyntheticModule {
        source: out,
        declaration_ids,
        original_spans,
        generated_spans,
        mappings,
    }
}

fn render_import_line(imports: &[MacroImport]) -> Option<String> {
    let mut grouped = BTreeMap::<&str, Vec<(&str, &str)>>::new();
    for import_decl in imports {
        let specifiers = grouped.entry(import_decl.source.as_str()).or_default();
        let specifier = (
            import_decl.imported_name.as_str(),
            import_decl.local_name.as_str(),
        );
        if !specifiers.contains(&specifier) {
            specifiers.push(specifier);
        }
    }

    if grouped.is_empty() {
        return None;
    }

    let lines = grouped
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

    Some(lines)
}

fn normalize_candidate_source(source: &str, candidate: &MacroCandidate) -> String {
    let outer = &source[candidate.outer_span.start..candidate.outer_span.end];
    if candidate.strip_spans.is_empty() {
        return outer.to_string();
    }

    let mut output = String::new();
    let mut cursor = candidate.outer_span.start;
    let mut strips = candidate.strip_spans.clone();
    strips.sort_by_key(|span| span.start);

    for strip in strips {
        if cursor < strip.start {
            output.push_str(&source[cursor..strip.start]);
        }
        cursor = strip.end.max(cursor);
    }

    if cursor < candidate.outer_span.end {
        output.push_str(&source[cursor..candidate.outer_span.end]);
    }

    output
}
