#[path = "support/astro.rs"]
mod astro_support;

use indoc::indoc;

use lingui_analyzer::{
    AstroCompilePlan, MacroCandidateKind, WhitespaceMode,
    framework::{FrameworkAdapter, astro::AstroAdapter},
};

use astro_support::{analyze_options_for_astro, astro_default_conventions};

#[test]
fn collects_aliased_frontmatter_macro_imports_and_candidates() {
    let source = indoc! {r#"
        ---
        import { t as tt, plural } from "@lingui/core/macro";

        const message = tt`Hello`;
        const countLabel = plural(count, { one: "item", other: "items" });
        ---
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");

    let imports = analysis
        .macro_imports
        .iter()
        .map(|import_decl| {
            (
                import_decl.imported_name.as_str(),
                import_decl.local_name.as_str(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(imports, vec![("t", "tt"), ("plural", "plural")]);

    let candidates = analysis
        .frontmatter_candidates
        .iter()
        .map(|candidate| {
            (
                candidate.kind,
                candidate.imported_name.as_str(),
                candidate.local_name.as_str(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        candidates,
        vec![
            (MacroCandidateKind::TaggedTemplateExpression, "t", "tt"),
            (MacroCandidateKind::CallExpression, "plural", "plural"),
        ]
    );
}

#[test]
fn allocates_unique_runtime_bindings_for_astro_compile() {
    let source = indoc! {r#"
        ---
        import { t } from "@lingui/core/macro";
        import { Trans } from "lingui-for-astro/macro";

        const __l4a_createI18n = "taken";
        const __l4a_i18n = "taken";
        const L4aRuntimeTrans = "taken";

        const message = t`Hello`;
        ---

        <Trans id="welcome" message="Welcome" />
        <p>{message}</p>
    "#};

    let plan = AstroCompilePlan::build(
        source,
        "Page.astro",
        "Page.astro?compile",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect("compile plan succeeds");

    assert_eq!(plan.runtime_bindings.create_i18n, "__l4a_createI18n_1");
    assert_eq!(plan.runtime_bindings.i18n, "__l4a_i18n_1");
    assert_eq!(plan.runtime_bindings.runtime_trans, "L4aRuntimeTrans_1");
}

#[test]
fn ignores_shadowed_bindings_in_nested_scopes() {
    let source = indoc! {r#"
        ---
        import { t, plural } from "@lingui/core/macro";

        function demo(t) {
          const plural = () => "local";
          return [t`ignored`, plural(1, { one: "x", other: "y" })];
        }

        const ok = t`kept`;
        ---
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");

    let candidates = analysis
        .frontmatter_candidates
        .iter()
        .map(|candidate| {
            (
                candidate.imported_name.as_str(),
                candidate.local_name.as_str(),
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(candidates, vec![("t", "t")]);
}

#[test]
fn marks_frontmatter_content_region() {
    let source = indoc! {r#"
        ---
        import { t } from "@lingui/core/macro";
        const message = t`Hello`;
        ---

        <div>{message}</div>
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");
    let frontmatter = analysis.frontmatter.expect("frontmatter exists");
    let extracted = &source[frontmatter.inner_span.start..frontmatter.inner_span.end];

    assert!(extracted.contains("import { t } from"));
    assert!(extracted.contains("const message = t`Hello`;"));
}

#[test]
fn collects_template_expression_candidates_from_frontmatter_imports() {
    let source = indoc! {r#"
        ---
        import { t as tt } from "@lingui/core/macro";
        ---

        <div>{tt`Hello`}</div>
        <div title={`x ${tt({ id: "msg" })}`}></div>
        <div>{((tt) => tt`ignored`)(tt)}</div>
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");
    let counts = analysis
        .template_expressions
        .iter()
        .map(|expression| expression.candidates.len())
        .collect::<Vec<_>>();

    assert_eq!(counts, vec![1, 1, 0]);
    assert_eq!(
        analysis.template_expressions[0].candidates[0].kind,
        MacroCandidateKind::TaggedTemplateExpression
    );
    assert_eq!(
        analysis.template_expressions[1].candidates[0].kind,
        MacroCandidateKind::CallExpression
    );
}

#[test]
fn supports_typescript_syntax_in_frontmatter_and_template_expressions() {
    let source = indoc! {r#"
        ---
        import { t as tt } from "@lingui/core/macro";

        const count: number = 1;
        const message = tt({ id: "typed", message: count satisfies number ? "ok" : "bad" });
        ---

        <div>{count && tt`Hello`}</div>
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");

    assert_eq!(analysis.frontmatter_candidates.len(), 1);
    assert_eq!(analysis.template_expressions.len(), 1);
    assert_eq!(analysis.template_expressions[0].candidates.len(), 1);
    assert_eq!(
        analysis.template_expressions[0].candidates[0].kind,
        MacroCandidateKind::TaggedTemplateExpression
    );
}

#[test]
fn anchors_frontmatter_translate_msg_candidates_to_the_outer_callee() {
    let source = indoc! {r#"
        ---
        import { msg, t as translate } from "@lingui/core/macro";

        const status = translate(msg`Loaded ${count} items.`);
        ---
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");
    let candidate = analysis
        .frontmatter_candidates
        .first()
        .expect("candidate exists");
    let anchor = candidate.source_map_anchor.expect("anchor exists");

    assert_eq!(
        &source[anchor.start..anchor.end],
        "translate",
        "direct frontmatter calls should anchor to the runtime callee",
    );
}

#[test]
fn collects_template_components_from_frontmatter_imports() {
    let source = indoc! {r#"
        ---
        import { Trans as T } from "lingui-for-astro/macro";
        ---

        <T id="root" />
        <div>
          <T id="nested" />
        </div>
        <span />
    "#};

    let analysis = AstroAdapter
        .analyze(source, &analyze_options_for_astro(WhitespaceMode::Astro))
        .expect("analysis succeeds");
    let summary = analysis
        .template_components
        .iter()
        .map(|component| {
            (
                component.candidate.kind,
                component.candidate.imported_name.as_str(),
                component.candidate.local_name.as_str(),
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(
        summary,
        vec![
            (MacroCandidateKind::Component, "Trans", "T"),
            (MacroCandidateKind::Component, "Trans", "T"),
        ]
    );
}
