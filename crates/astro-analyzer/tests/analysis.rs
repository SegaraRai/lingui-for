use astro_analyzer::{AstroExpressionKind, AstroTagKind, ByteRange, analyze_astro};
use indoc::indoc;

fn slice<'a>(source: &'a str, range: &ByteRange) -> &'a str {
    &source[range.start..range.end]
}

#[test]
fn analyzes_frontmatter_expressions_and_component_candidates() {
    let source = indoc! {r#"
        ---
        import { t, Trans } from "lingui-for-astro/macro";
        const href = "/docs";
        ---
        <div title={t`Hello`}>
          {t`Inline`}
          <Trans id="demo.docs">Read the <a href={href}>docs</a>.</Trans>
          <Component foo={t`attr`} client:load />
        </div>
    "#};

    let analysis = analyze_astro(source).expect("analysis should succeed");
    let frontmatter = analysis.frontmatter.expect("frontmatter should exist");

    assert_eq!(
        slice(source, &frontmatter.range),
        "---\nimport { t, Trans } from \"lingui-for-astro/macro\";\nconst href = \"/docs\";\n---"
    );
    assert_eq!(
        slice(source, &frontmatter.content_range),
        "\nimport { t, Trans } from \"lingui-for-astro/macro\";\nconst href = \"/docs\";"
    );

    assert_eq!(analysis.expressions.len(), 4);
    assert_eq!(
        analysis
            .expressions
            .iter()
            .map(|expression| expression.kind)
            .collect::<Vec<_>>(),
        vec![
            AstroExpressionKind::AttributeInterpolation,
            AstroExpressionKind::HtmlInterpolation,
            AstroExpressionKind::AttributeInterpolation,
            AstroExpressionKind::AttributeInterpolation,
        ]
    );
    assert_eq!(
        slice(source, &analysis.expressions[0].inner_range),
        "t`Hello`"
    );
    assert_eq!(
        slice(source, &analysis.expressions[1].inner_range),
        "t`Inline`"
    );
    assert_eq!(slice(source, &analysis.expressions[2].inner_range), "href");
    assert_eq!(
        slice(source, &analysis.expressions[3].inner_range),
        "t`attr`"
    );

    assert_eq!(analysis.component_candidates.len(), 2);

    let trans = &analysis.component_candidates[0];
    assert_eq!(trans.tag_name, "Trans");
    assert_eq!(trans.tag_kind, AstroTagKind::Normal);
    assert_eq!(
        slice(source, &trans.range),
        "<Trans id=\"demo.docs\">Read the <a href={href}>docs</a>.</Trans>"
    );

    let component = &analysis.component_candidates[1];
    assert_eq!(component.tag_name, "Component");
    assert_eq!(component.tag_kind, AstroTagKind::SelfClosing);
    assert_eq!(
        slice(source, &component.tag_start_range),
        "<Component foo={t`attr`} client:load />"
    );

    assert!(!analysis.has_errors);
}

#[test]
fn captures_backtick_attribute_expressions() {
    let source = indoc! {r#"
        <Pagination href=`/docs/${page}` />
    "#};

    let analysis = analyze_astro(source).expect("analysis should succeed");

    assert_eq!(analysis.expressions.len(), 1);
    assert_eq!(
        analysis.expressions[0].kind,
        AstroExpressionKind::AttributeBacktickString
    );
    assert_eq!(
        slice(source, &analysis.expressions[0].inner_range),
        "/docs/${page}"
    );

    assert_eq!(analysis.component_candidates.len(), 1);
    assert_eq!(analysis.component_candidates[0].tag_name, "Pagination");
}

#[test]
fn reports_parse_errors_without_failing_analysis() {
    let source = "<Trans>{name</Trans>";
    let analysis = analyze_astro(source).expect("analysis should succeed");

    assert!(analysis.has_errors);
    assert!(analysis.expressions.is_empty());
    assert!(analysis.component_candidates.is_empty());
}
