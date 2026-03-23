use crate::{
    AnalyzerError, CompileTargetContext, CompileTargetOutputKind, MacroCandidate,
    MacroCandidateStrategy, MacroFlavor, compile_plan::CompileTargetPrototype,
};

pub fn validate_svelte_compile_targets(
    prototypes: &[CompileTargetPrototype],
) -> Result<(), AnalyzerError> {
    let offending_macro = prototypes.iter().find_map(|prototype| {
        (matches!(
            prototype.context,
            CompileTargetContext::ModuleScript | CompileTargetContext::InstanceScript
        ) && prototype.output_kind == CompileTargetOutputKind::Expression
            && is_forbidden_bare_direct_svelte_macro(&prototype.candidate))
        .then_some(prototype.candidate.imported_name.as_str())
    });

    if let Some(imported_name) = offending_macro {
        return Err(AnalyzerError::InvalidMacroUsage(bare_direct_macro_message(
            imported_name,
        )));
    }

    Ok(())
}

pub fn validate_svelte_extract_candidates(
    candidates: &[MacroCandidate],
) -> Result<(), AnalyzerError> {
    let offending_macro = candidates
        .iter()
        .find(|candidate| is_forbidden_bare_direct_svelte_macro(candidate))
        .map(|candidate| candidate.imported_name.as_str());

    if let Some(imported_name) = offending_macro {
        return Err(AnalyzerError::InvalidMacroUsage(bare_direct_macro_message(
            imported_name,
        )));
    }

    Ok(())
}

fn is_forbidden_bare_direct_svelte_macro(candidate: &MacroCandidate) -> bool {
    candidate.strategy == MacroCandidateStrategy::Standalone
        && candidate.flavor == MacroFlavor::Direct
        && matches!(
            candidate.imported_name.as_str(),
            "t" | "plural" | "select" | "selectOrdinal"
        )
}

fn bare_direct_macro_message(imported_name: &str) -> String {
    match imported_name {
        "t" => {
            "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string()
        }
        "plural" | "select" | "selectOrdinal" => format!(
            "Bare `{imported_name}` in `.svelte` files is only allowed in reactive `$derived(...)`, `$derived.by(...)`, and template expressions. Use `${imported_name}` there or `{imported_name}.eager(...)` for non-reactive script translations."
        ),
        other => format!("Unsupported bare direct macro `{other}` in `.svelte` files."),
    }
}
