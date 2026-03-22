use indoc::indoc;
use lingui_analyzer::{
    MacroCandidateKind,
    framework::{FrameworkAdapter, astro::AstroAdapter},
};

#[test]
fn collects_aliased_frontmatter_macro_imports_and_candidates() {
    let source = indoc! {r#"
        ---
        import { t as tt, plural } from "@lingui/core/macro";

        const message = tt`Hello`;
        const countLabel = plural(count, { one: "item", other: "items" });
        ---
    "#};

    let analysis = AstroAdapter.analyze(source).expect("analysis succeeds");

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

    let analysis = AstroAdapter.analyze(source).expect("analysis succeeds");

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

    let analysis = AstroAdapter.analyze(source).expect("analysis succeeds");
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

    let analysis = AstroAdapter.analyze(source).expect("analysis succeeds");
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

    let analysis = AstroAdapter.analyze(source).expect("analysis succeeds");

    assert_eq!(analysis.frontmatter_candidates.len(), 1);
    assert_eq!(analysis.template_expressions.len(), 1);
    assert_eq!(analysis.template_expressions[0].candidates.len(), 1);
    assert_eq!(
        analysis.template_expressions[0].candidates[0].kind,
        MacroCandidateKind::TaggedTemplateExpression
    );
}
