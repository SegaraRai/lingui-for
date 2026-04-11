use indoc::indoc;
use lean_string::LeanString;

use lingui_analyzer::{RuntimeWarningOptions, SvelteCompilePlan, WhitespaceMode};

#[path = "support/svelte_conventions.rs"]
mod svelte_conventions;

use svelte_conventions::svelte_default_conventions;

fn ls(text: &str) -> LeanString {
    LeanString::from(text)
}

fn assert_svelte_trans_allowed(source: &str) {
    let source = ls(source);
    let source_name = ls("Component.svelte");
    let synthetic_name = ls("Component.svelte?compile");
    SvelteCompilePlan::build(
        &source,
        &source_name,
        &synthetic_name,
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
        RuntimeWarningOptions::default(),
    )
    .expect("Svelte <Trans> syntax should be allowed");
}

fn assert_svelte_trans_rejected(source: &str, needle: &str) {
    let source = ls(source);
    let source_name = ls("Component.svelte");
    let synthetic_name = ls("Component.svelte?compile");
    let error = SvelteCompilePlan::build(
        &source,
        &source_name,
        &synthetic_name,
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
        RuntimeWarningOptions::default(),
    )
    .expect_err("Svelte <Trans> syntax should be rejected");

    assert!(
        error.to_string().contains(needle),
        "expected error to contain `{needle}`, got: {error}"
    );
}

#[test]
fn allows_html_component_nested_and_self_closing_wrappers() {
    let cases = [
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
            </script>

            <Trans>Read the <a href="/docs">docs</a>.</Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              import DocLink from "./DocLink.svelte";
            </script>

            <Trans>Read the <DocLink href="/docs">docs</DocLink>.</Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              import DocLink from "./DocLink.svelte";
            </script>

            <Trans><strong><DocLink href="/docs">docs</DocLink></strong></Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              import Icon from "./Icon.svelte";
            </script>

            <Trans>Open <Icon name="external" /> docs.</Trans>
        "#},
    ];

    for source in cases {
        assert_svelte_trans_allowed(source);
    }
}

#[test]
fn allows_wrapper_directives_with_source_based_runtime_lowering() {
    let cases = [
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              let value = "";
            </script>

            <Trans><input bind:value={value}>field</input></Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              let active = false;
              function click() {}
            </script>

            <Trans><button class:active={active} on:click={click}>Press</button></Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              import DocLink from "./DocLink.svelte";
              let active = false;
              function tooltip() {}
            </script>

            <Trans><DocLink href="/docs" class:active={active} use:tooltip><strong>Docs</strong></DocLink></Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
              let color = "red";
              function tooltip() {}
            </script>

            <Trans><span style:color={color} use:tooltip>Label</span></Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
            </script>

            <Trans><div transition:fade in:fly out:fade animate:flip>Animated</div></Trans>
        "#},
    ];

    for source in cases {
        assert_svelte_trans_allowed(source);
    }
}

#[test]
fn allows_html_and_render_tags_inside_trans() {
    let cases = [
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
            </script>

            <Trans>{@html html}</Trans>
        "#},
        indoc! {r#"
            <script>
              import { Trans } from "lingui-for-svelte/macro";
            </script>

            <Trans>{@render snippet()}</Trans>
        "#},
    ];

    for source in cases {
        assert_svelte_trans_allowed(source);
    }
}

#[test]
fn rejects_block_syntax_inside_trans() {
    let cases = [
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans>{#if ready}<span>Ready</span>{/if}</Trans>
            "#},
            "Svelte block syntax",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans>{#each items as item}<span>{item}</span>{/each}</Trans>
            "#},
            "Svelte block syntax",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans>{#await promise}<span>Loading</span>{/await}</Trans>
            "#},
            "Svelte block syntax",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans>{#key id}<span>Keyed</span>{/key}</Trans>
            "#},
            "Svelte block syntax",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans>{#snippet demo()}<span>Snippet</span>{/snippet}</Trans>
            "#},
            "Svelte block syntax",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans>{@const label = "const"}<span>{label}</span></Trans>
            "#},
            "Svelte block syntax",
        ),
    ];

    for (source, needle) in cases {
        assert_svelte_trans_rejected(source, needle);
    }
}

#[test]
fn rejects_special_elements_and_slots_inside_trans() {
    let cases = [
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><slot /></Trans>
            "#},
            "Svelte special element `<slot>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:element this="p">Text</svelte:element></Trans>
            "#},
            "Svelte special element `<svelte:element>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:component this={Comp}>Text</svelte:component></Trans>
            "#},
            "Svelte special element `<svelte:component>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:self>Text</svelte:self></Trans>
            "#},
            "Svelte special element `<svelte:self>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:fragment>Text</svelte:fragment></Trans>
            "#},
            "Svelte special element `<svelte:fragment>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:body on:click={() => {}} /></Trans>
            "#},
            "Svelte special element `<svelte:body>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:window on:resize={() => {}} /></Trans>
            "#},
            "Svelte special element `<svelte:window>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:document on:visibilitychange={() => {}} /></Trans>
            "#},
            "Svelte special element `<svelte:document>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:head><title>Docs</title></svelte:head></Trans>
            "#},
            "Svelte special element `<svelte:head>`",
        ),
        (
            indoc! {r#"
                <script>
                  import { Trans } from "lingui-for-svelte/macro";
                </script>

                <Trans><svelte:options immutable /></Trans>
            "#},
            "Svelte special element `<svelte:options>`",
        ),
    ];

    for (source, needle) in cases {
        assert_svelte_trans_rejected(source, needle);
    }
}

#[test]
fn allows_multiple_wrappers_with_mixed_directives() {
    assert_svelte_trans_allowed(indoc! {r#"
        <script>
          import { Trans } from "lingui-for-svelte/macro";
          import DocLink from "./DocLink.svelte";
          let active = false;
          function click() {}
        </script>

        <Trans><button class:active={active} on:click={click}><DocLink href="/docs">Docs</DocLink></button> and <span transition:fade>later</span></Trans>
    "#});
}

#[test]
fn allows_slot_let_wrappers_when_treated_as_native_shells() {
    assert_svelte_trans_allowed(indoc! {r#"
        <script>
          import { Trans } from "lingui-for-svelte/macro";
          import Wrapper from "./Wrapper.svelte";
        </script>

        <Trans><Wrapper let:item><span>{item}</span></Wrapper></Trans>
    "#});
}
