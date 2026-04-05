use crate::common::{IndexedText, Span, build_span_anchor_map};
use crate::compile::CompileReplacementInternal;
use crate::conventions::FrameworkConventions;

use super::{AstroAdapterError, AstroCompilePlan, AstroCompileRuntimeBindings};

pub(super) fn append_runtime_injection_replacements(
    plan: &AstroCompilePlan,
    source: &str,
    replacements: &mut Vec<CompileReplacementInternal>,
) -> Result<(), AstroAdapterError> {
    let indexed_source = IndexedText::new(source);
    let injections = build_frontmatter_injections(
        plan.runtime_requirements.needs_runtime_i18n_binding,
        plan.runtime_requirements.needs_runtime_trans_component,
        &plan.runtime_bindings,
        &plan.common.conventions,
    )?;
    let prelude = injections.prelude;
    let suffix = injections.suffix;

    if prelude.is_empty() && suffix.is_empty() {
        return Ok(());
    }

    if let Some(frontmatter) = &plan.frontmatter {
        let code = if frontmatter.has_remaining_content_after_import_removal {
            format!("{prelude}\n")
        } else {
            prelude
        };
        let anchor_span = plan
            .common
            .import_removals
            .first()
            .copied()
            .unwrap_or(Span::new(
                frontmatter.prelude_insert_point,
                frontmatter.prelude_insert_point,
            ));
        let source_map = build_span_anchor_map(
            plan.common.source_name.as_str(),
            &indexed_source,
            code.as_str(),
            anchor_span.start,
            anchor_span.end,
        );
        replacements.push(CompileReplacementInternal::new(
            "__runtime_frontmatter_prelude".to_string(),
            frontmatter.prelude_insert_point,
            frontmatter.prelude_insert_point,
            code,
            source_map,
            Vec::new(),
        ));

        if !frontmatter.has_remaining_content_after_import_removal
            && let Some(range) = frontmatter.trailing_whitespace_range
        {
            replacements.push(CompileReplacementInternal::new(
                "__runtime_frontmatter_trailing_ws".to_string(),
                range.start,
                range.end,
                String::new(),
                None,
                Vec::new(),
            ));
        }

        if !suffix.is_empty() {
            replacements.push(CompileReplacementInternal::new(
                "__runtime_frontmatter_suffix".to_string(),
                frontmatter.content_span.end,
                frontmatter.content_span.end,
                suffix,
                None,
                Vec::new(),
            ));
        }
        return Ok(());
    }

    let newline_for_suffix = if suffix.is_empty() { "" } else { "\n" };
    let code = format!("---\n{prelude}{suffix}{newline_for_suffix}---\n");
    let source_map = build_span_anchor_map(
        plan.common.source_name.as_str(),
        &indexed_source,
        code.as_str(),
        0,
        0,
    );
    replacements.push(CompileReplacementInternal::new(
        "__runtime_frontmatter_block".to_string(),
        0,
        0,
        code,
        source_map,
        Vec::new(),
    ));
    Ok(())
}

struct FrontmatterInjections {
    prelude: String,
    suffix: String,
}

fn build_frontmatter_injections(
    include_astro_context: bool,
    include_runtime_trans: bool,
    bindings: &AstroCompileRuntimeBindings,
    conventions: &FrameworkConventions,
) -> Result<FrontmatterInjections, AstroAdapterError> {
    let mut prelude = String::new();
    let mut suffix = String::new();
    let runtime_package = conventions.runtime.package.as_str();
    let trans_export = conventions.runtime.exports.trans.as_str();
    let i18n_accessor_export = conventions.runtime.exports.i18n_accessor.as_deref().ok_or(
        AstroAdapterError::MissingConvention("runtime.exports.i18n_accessor"),
    )?;

    if include_astro_context {
        prelude.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            i18n_accessor_export, bindings.create_i18n, runtime_package
        ));
        prelude.push_str(&format!(
            "const {} = {}(Astro.locals);\n",
            bindings.i18n, bindings.create_i18n
        ));
        suffix.push_str(&format!("\n{}.prime();", bindings.i18n));
    }

    if include_runtime_trans {
        prelude.push_str(&format!(
            "import {{ {} as {} }} from \"{}\";\n",
            trans_export, bindings.runtime_trans, runtime_package
        ));
    }

    Ok(FrontmatterInjections { prelude, suffix })
}
