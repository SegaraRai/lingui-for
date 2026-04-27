use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{IndexedText, Span, build_span_anchor_map};
use crate::conventions::FrameworkConventions;
use crate::syntax::parse::parse_astro;
use crate::transform::TransformReplacementInternal;

use super::{AstroAdapterError, AstroTransformPlan, AstroTransformRuntimeBindings};

pub(super) fn append_runtime_injection_replacements(
    plan: &AstroTransformPlan,
    source: &LeanString,
    replacements: &mut Vec<TransformReplacementInternal>,
) -> Result<(), AstroAdapterError> {
    append_fragment_normalization_replacements(plan, source, replacements)?;

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
            LeanString::from(format!("{prelude}\n"))
        } else {
            prelude
        };
        let anchor_span =
            plan.common
                .import_removals
                .first()
                .copied()
                .unwrap_or(Span::new_unchecked(
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
        replacements.push(TransformReplacementInternal::new(
            LeanString::from_static_str("__runtime_frontmatter_prelude"),
            frontmatter.prelude_insert_point,
            frontmatter.prelude_insert_point,
            code,
            source_map,
            Vec::new(),
        ));

        if !frontmatter.has_remaining_content_after_import_removal
            && let Some(range) = frontmatter.trailing_whitespace_range
        {
            replacements.push(TransformReplacementInternal::new(
                LeanString::from_static_str("__runtime_frontmatter_trailing_ws"),
                range.start,
                range.end,
                LeanString::new(),
                None,
                Vec::new(),
            ));
        }

        if !suffix.is_empty() {
            replacements.push(TransformReplacementInternal::new(
                LeanString::from_static_str("__runtime_frontmatter_suffix"),
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
    let code = LeanString::from(format!("---\n{prelude}{suffix}{newline_for_suffix}---\n"));
    let source_map = build_span_anchor_map(
        plan.common.source_name.as_str(),
        &indexed_source,
        code.as_str(),
        0,
        0,
    );
    replacements.push(TransformReplacementInternal::new(
        LeanString::from_static_str("__runtime_frontmatter_block"),
        0,
        0,
        code,
        source_map,
        Vec::new(),
    ));
    Ok(())
}

fn append_fragment_normalization_replacements(
    plan: &AstroTransformPlan,
    source: &LeanString,
    replacements: &mut Vec<TransformReplacementInternal>,
) -> Result<(), AstroAdapterError> {
    if plan.common.targets.is_empty() {
        return Ok(());
    }

    let tree = parse_astro(source)?;
    collect_fragment_normalization_replacements(plan, tree.root_node(), replacements);
    Ok(())
}

fn collect_fragment_normalization_replacements(
    plan: &AstroTransformPlan,
    node: Node<'_>,
    replacements: &mut Vec<TransformReplacementInternal>,
) {
    if node.kind() == "element"
        && node_contains_transform_target(plan, node)
        && let Some((start_tag, end_tag)) = fragment_tag_pair(node)
    {
        replacements.push(TransformReplacementInternal::new(
            LeanString::from(format!("__astro_fragment_start_{}", start_tag.start_byte())),
            start_tag.start_byte(),
            start_tag.end_byte(),
            LeanString::from_static_str("<Fragment>"),
            None,
            Vec::new(),
        ));
        replacements.push(TransformReplacementInternal::new(
            LeanString::from(format!("__astro_fragment_end_{}", end_tag.start_byte())),
            end_tag.start_byte(),
            end_tag.end_byte(),
            LeanString::from_static_str("</Fragment>"),
            None,
            Vec::new(),
        ));
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_fragment_normalization_replacements(plan, child, replacements);
    }
}

fn node_contains_transform_target(plan: &AstroTransformPlan, node: Node<'_>) -> bool {
    let span = Span::from_node(node);
    // retain_standalone_prototypes sorts prototypes by outer_span, and targets preserve that
    // order with original_span set from candidate.outer_span.
    let first_contained = plan
        .common
        .targets
        .partition_point(|target| target.original_span.start < span.start);
    plan.common.targets[first_contained..]
        .iter()
        .take_while(|target| target.original_span.start <= span.end)
        .any(|target| target.original_span.end <= span.end)
}

fn fragment_tag_pair(node: Node<'_>) -> Option<(Node<'_>, Node<'_>)> {
    let mut cursor = node.walk();
    let mut start_tag = None;
    let mut end_tag = None;
    for child in node.children(&mut cursor) {
        match child.kind() {
            "start_tag" if start_tag.is_none() && tag_name(child).is_none() => {
                start_tag = Some(child);
            }
            "end_tag" if tag_name(child).is_none() => {
                end_tag = Some(child);
            }
            _ => {}
        }
    }
    let start_tag = start_tag?;
    let end_tag = end_tag?;
    Some((start_tag, end_tag))
}

fn tag_name(node: Node<'_>) -> Option<Node<'_>> {
    node.children(&mut node.walk())
        .find(|child| child.kind() == "tag_name" && child.start_byte() != child.end_byte())
}

struct FrontmatterInjections {
    prelude: LeanString,
    suffix: LeanString,
}

fn build_frontmatter_injections(
    include_astro_context: bool,
    include_runtime_trans: bool,
    bindings: &AstroTransformRuntimeBindings,
    conventions: &FrameworkConventions,
) -> Result<FrontmatterInjections, AstroAdapterError> {
    let mut prelude = LeanString::new();
    let mut suffix = LeanString::new();
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
