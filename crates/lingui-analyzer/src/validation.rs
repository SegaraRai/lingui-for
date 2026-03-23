use crate::{
    AnalyzerError, CompileTargetContext, CompileTargetOutputKind, MacroFlavor,
    compile_plan::CompileTargetPrototype,
};

pub fn validate_svelte_compile_targets(
    prototypes: &[CompileTargetPrototype],
) -> Result<(), AnalyzerError> {
    let has_bare_direct_t = prototypes.iter().any(|prototype| {
        matches!(
            prototype.context,
            CompileTargetContext::ModuleScript | CompileTargetContext::InstanceScript
        ) && prototype.output_kind == CompileTargetOutputKind::Expression
            && prototype.candidate.flavor == MacroFlavor::Direct
            && prototype.candidate.imported_name == "t"
    });

    if has_bare_direct_t {
        return Err(AnalyzerError::InvalidMacroUsage(
            "Bare `t` in `.svelte` files is not allowed. Use `$t` in instance/template code or `t.eager` for non-reactive script translations.".to_string(),
        ));
    }

    Ok(())
}
