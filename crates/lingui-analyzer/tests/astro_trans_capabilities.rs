#[path = "support/astro_conventions.rs"]
mod astro_conventions;

use indoc::indoc;

use lingui_analyzer::{AstroCompilePlan, WhitespaceMode};

use astro_conventions::astro_default_conventions;

fn assert_astro_trans_allowed(source: &str) {
    AstroCompilePlan::build(
        source,
        "Page.astro",
        "Page.astro?compile",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect("Astro <Trans> syntax should be allowed");
}

fn assert_astro_trans_rejected(source: &str, needle: &str) {
    let error = AstroCompilePlan::build(
        source,
        "Page.astro",
        "Page.astro?compile",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect_err("Astro <Trans> syntax should be rejected");

    assert!(
        error.to_string().contains(needle),
        "expected error to contain `{needle}`, got: {error}"
    );
}

#[test]
fn allows_html_component_and_nested_wrappers() {
    let cases = [
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            ---

            <Trans>Read the <a href="/docs">docs</a>.</Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            import DocLink from "../components/DocLink.astro";
            ---

            <Trans>Read the <DocLink href="/docs">docs</DocLink>.</Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            import DocLink from "../components/DocLink.astro";
            ---

            <Trans><strong><DocLink href="/docs">docs</DocLink></strong></Trans>
        "#},
    ];

    for source in cases {
        assert_astro_trans_allowed(source);
    }
}

#[test]
fn allows_native_astro_directives_that_fit_the_new_runtime_contract() {
    let cases = [
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            import DocLink from "../components/DocLink.astro";
            const classes = ["notice"];
            ---

            <Trans><DocLink href="/docs" class:list={classes}><strong>Label</strong></DocLink></Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            ---

            <Trans><div transition:name="fade">Label</div></Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            import Icon from "../components/Icon.astro";
            ---

            <Trans>Open <Icon name="external" /> docs.</Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            const classes = ["notice"];
            ---

            <Trans><span class:list={classes}>Label</span> and <div transition:name="fade">Later</div></Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            ---

            <Trans><Button client:load>Label</Button></Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            ---

            <Trans><Button server:defer>Label</Button></Trans>
        "#},
        indoc! {r#"
            ---
            import { Trans } from "lingui-for-astro/macro";
            const classes = ["notice"];
            ---

            <Trans><Button client:visible class:list={classes}>Label</Button></Trans>
        "#},
    ];

    for source in cases {
        assert_astro_trans_allowed(source);
    }
}

#[test]
fn rejects_directives_that_conflict_with_runtime_trans_output() {
    let cases = [
        (
            indoc! {r#"
                ---
                import { Trans } from "lingui-for-astro/macro";
                ---

                <Trans><span set:text="text">Label</span></Trans>
            "#},
            "Astro directive `set:text`",
        ),
        (
            indoc! {r#"
                ---
                import { Trans } from "lingui-for-astro/macro";
                ---

                <Trans><div define:vars={{ color: "red" }}>Label</div></Trans>
            "#},
            "Astro directive `define:vars`",
        ),
        (
            indoc! {r#"
                ---
                import { Trans } from "lingui-for-astro/macro";
                ---

                <Trans><style>p { color: red; }</style></Trans>
            "#},
            "Astro special element `<style>`",
        ),
        (
            indoc! {r#"
                ---
                import { Trans } from "lingui-for-astro/macro";
                ---

                <Trans><script>console.log("x")</script></Trans>
            "#},
            "Astro special element `<script>`",
        ),
        (
            indoc! {r#"
                ---
                import { Trans } from "lingui-for-astro/macro";
                ---

                <Trans><script is:inline>console.log("x")</script></Trans>
            "#},
            "Astro special element `<script>`",
        ),
    ];

    for (source, needle) in cases {
        assert_astro_trans_rejected(source, needle);
    }
}

#[test]
fn rejects_set_html_wrappers_that_replace_the_child_hole() {
    assert_astro_trans_rejected(
        indoc! {r#"
        ---
        import { Trans } from "lingui-for-astro/macro";
        ---

        <Trans><article set:html={"<em>Docs</em>"} /></Trans>
    "#},
        "Astro directive `set:html`",
    );
}

#[test]
fn rejects_mixed_conflicting_astro_directives() {
    let cases = [(
        indoc! {r#"
                ---
                import { Trans } from "lingui-for-astro/macro";
                ---

                <Trans><article set:html={"<em>Docs</em>"} transition:name="fade" /></Trans>
            "#},
        "Astro directive `set:html`",
    )];

    for (source, needle) in cases {
        assert_astro_trans_rejected(source, needle);
    }
}
