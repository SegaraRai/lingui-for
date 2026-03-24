mod astro;
mod svelte;

use crate::{AnalyzerError, common::Span, framework::MacroImport};

use super::{
    CompilePlan, CompileReplacement, CompileRuntimeBindings, CompileScriptRegion, CompileTarget,
    CompileTargetPrototype, RuntimeRequirements,
};

pub(crate) use astro::AstroCompileAdapter;
pub(crate) use svelte::SvelteCompileAdapter;

#[derive(Debug, Clone)]
pub(crate) struct FrameworkCompileAnalysis {
    pub(crate) imports: Vec<MacroImport>,
    pub(crate) prototypes: Vec<CompileTargetPrototype>,
    pub(crate) import_removals: Vec<Span>,
    pub(crate) runtime_bindings: Option<CompileRuntimeBindings>,
    pub(crate) instance_script: Option<CompileScriptRegion>,
    pub(crate) module_script: Option<CompileScriptRegion>,
    pub(crate) synthetic_lang: String,
}

pub(crate) trait FrameworkCompileAdapter {
    fn framework_name(&self) -> &'static str;

    fn analyze_compile(&self, source: &str) -> Result<FrameworkCompileAnalysis, AnalyzerError>;

    fn wrap_compile_source(
        &self,
        prototype: &CompileTargetPrototype,
        normalized_source: &str,
    ) -> String {
        let _ = prototype;
        normalized_source.to_string()
    }

    fn compute_runtime_requirements(&self, targets: &[CompileTarget]) -> RuntimeRequirements;

    fn repair_compile_targets(&self, _source: &str, _targets: &mut [CompileTarget]) {}

    fn lower_runtime_component_markup(
        &self,
        declaration_code: &str,
        _runtime_component_name: Option<&str>,
    ) -> Result<String, AnalyzerError> {
        Ok(declaration_code.to_string())
    }

    fn append_runtime_injection_replacements(
        &self,
        _plan: &CompilePlan,
        _source: &str,
        _replacements: &mut Vec<CompileReplacement>,
    ) -> Result<(), AnalyzerError> {
        Ok(())
    }
}

pub(crate) fn compile_adapter_for_framework(
    framework: &str,
) -> Result<&'static dyn FrameworkCompileAdapter, AnalyzerError> {
    match framework {
        "astro" => Ok(&AstroCompileAdapter),
        "svelte" => Ok(&SvelteCompileAdapter),
        _ => Err(AnalyzerError::UnsupportedFramework(framework.to_string())),
    }
}
