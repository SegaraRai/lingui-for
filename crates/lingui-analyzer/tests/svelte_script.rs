use indoc::indoc;
use lingui_analyzer::{
    MacroCandidateKind, MacroFlavor,
    framework::{
        FrameworkAdapter,
        svelte::{SvelteAdapter, analyze_svelte},
    },
};

#[test]
fn collects_svelte_script_macros_with_reactive_and_eager_flavors() {
    let source = indoc! {r#"
        <script>
          import { t as tt, plural } from "@lingui/core/macro";

          const direct = tt`Hello`;
          const eager = tt.eager({ id: "msg" });
          const reactive = $plural(count, { one: "item", other: "items" });
        </script>
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    assert_eq!(analysis.scripts.len(), 1);
    assert!(analysis.template_expressions.is_empty());
    assert!(analysis.template_components.is_empty());

    let script = &analysis.scripts[0];
    assert!(!script.is_module);
    assert_eq!(script.macro_imports.len(), 2);

    let summary = script
        .candidates
        .iter()
        .map(|candidate| {
            (
                candidate.kind,
                candidate.imported_name.as_str(),
                candidate.local_name.as_str(),
                candidate.flavor,
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(
        summary,
        vec![
            (
                MacroCandidateKind::TaggedTemplateExpression,
                "t",
                "tt",
                MacroFlavor::Direct,
            ),
            (
                MacroCandidateKind::CallExpression,
                "t",
                "tt",
                MacroFlavor::Eager,
            ),
            (
                MacroCandidateKind::CallExpression,
                "plural",
                "plural",
                MacroFlavor::Reactive,
            ),
        ]
    );
}

#[test]
fn supports_typescript_syntax_in_svelte_script() {
    let source = indoc! {r#"
        <script lang="ts">
          import { t } from "@lingui/core/macro";

          const count: number = 1;
          const message = t({ id: "typed", message: count satisfies number ? "ok" : "bad" });
        </script>
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let script = &analysis.scripts[0];

    assert_eq!(script.candidates.len(), 1);
    assert_eq!(script.candidates[0].imported_name, "t");
}

#[test]
fn ignores_shadowed_names_in_svelte_script() {
    let source = indoc! {r#"
        <script context="module">
          import { t } from "@lingui/core/macro";

          function demo(t) {
            return t`ignored`;
          }

          const kept = t`kept`;
        </script>
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let script = &analysis.scripts[0];

    assert!(script.is_module);
    assert_eq!(script.candidates.len(), 1);
    assert_eq!(script.candidates[0].imported_name, "t");
    assert_eq!(script.candidates[0].flavor, MacroFlavor::Direct);
}

#[test]
fn tracks_template_scope_shadowing_across_svelte_binders() {
    let source = indoc! {r#"
        <script>
          import { t } from "@lingui/core/macro";
        </script>

        {t`root`}
        {#each items as t}
          {t`each-shadowed`}
        {/each}
        {#await promise}
          {:then t}
          {t`then-shadowed`}
        {/await}
        {#await promise}
          {:catch t}
          {t`catch-shadowed`}
        {/await}
        {#snippet row(t)}
          {t`snippet-shadowed`}
        {/snippet}
        {#if visible}
          {@const t = localize()}
          {t`const-shadowed`}
        {/if}
        <Widget let:t>
          {t`let-shadowed`}
        </Widget>
        {t`after-widget`}
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let summary = analysis
        .template_expressions
        .iter()
        .map(|expression| {
            (
                source[expression.inner_span.start..expression.inner_span.end].trim(),
                expression.candidates.len(),
                expression.shadowed_names.clone(),
            )
        })
        .collect::<Vec<_>>();

    assert!(summary.contains(&("t`root`", 1, vec![])));
    assert!(summary.contains(&("t`each-shadowed`", 0, vec!["t".to_string()],)));
    assert!(summary.contains(&("t`then-shadowed`", 0, vec!["t".to_string()],)));
    assert!(summary.contains(&("t`catch-shadowed`", 0, vec!["t".to_string()],)));
    assert!(summary.contains(&("t`snippet-shadowed`", 0, vec!["t".to_string()],)));
    assert!(summary.contains(&("t`const-shadowed`", 0, vec!["t".to_string()],)));
    assert!(summary.contains(&("t`let-shadowed`", 0, vec!["t".to_string()],)));
    assert!(summary.contains(&("t`after-widget`", 1, vec![])));
    assert_eq!(
        analysis
            .template_expressions
            .iter()
            .find(
                |expression| source[expression.inner_span.start..expression.inner_span.end].trim()
                    == "t`after-widget`"
            )
            .expect("after-widget expression exists")
            .candidates[0]
            .imported_name,
        "t"
    );
}

#[test]
fn treats_instance_script_non_macro_bindings_as_template_shadowing() {
    let source = indoc! {r#"
        <script lang="ts">
          import { t } from "./macro";
          const label = t`Hello from another module`;
        </script>

        <p>{$t`Reactive from markup without a macro import`}</p>
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");

    assert_eq!(analysis.scripts[0].macro_imports.len(), 0);
    assert_eq!(
        analysis.template_expressions[0]
            .shadowed_names
            .iter()
            .filter(|name| name.as_str() == "t")
            .count(),
        1
    );
    assert!(
        analysis.template_expressions[0].candidates.is_empty(),
        "template $t should stay inactive when t comes from a non-macro import"
    );
}

#[test]
fn collects_macro_candidates_from_const_tag_initializers() {
    let source = r#"
<script lang="ts">
  import { t } from "lingui-for-svelte/macro";
  let mode = "idle";
  let items = ["placeholder"];
</script>

{#if true}
  {@const statusSummary =
    mode === "idle"
      ? $t`Status summary: idle`
      : $t`Status summary: active`}

  <p>{statusSummary}</p>
{/if}

{#each items as item, index (item)}
  {@const rowSummary = $t`Row ${index + 1}: ${item}`}
  <span>{rowSummary}</span>
{/each}
"#;

    let analysis = analyze_svelte(source).expect("svelte analysis should succeed");
    let messages = analysis
        .template_expressions
        .iter()
        .flat_map(|expression| expression.candidates.iter())
        .map(|candidate| &candidate.local_name)
        .collect::<Vec<_>>();

    assert_eq!(messages.iter().filter(|name| **name == "t").count(), 3);
}

#[test]
fn collects_template_components_with_scope_aware_shadowing() {
    let source = indoc! {r#"
        <script>
          import { Trans as T } from "@lingui/react/macro";
        </script>

        <T id="root" />
        {#each items as T}
          <T id="shadowed" />
        {/each}
        <Widget let:T>
          <T id="slot-shadowed" />
        </Widget>
        <T id="after-widget" />
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let summary = analysis
        .template_components
        .iter()
        .map(|component| {
            (
                component.candidate.kind,
                component.candidate.imported_name.as_str(),
                component.candidate.local_name.as_str(),
                component.shadowed_names.clone(),
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(
        summary,
        vec![
            (MacroCandidateKind::Component, "Trans", "T", vec![],),
            (MacroCandidateKind::Component, "Trans", "T", vec![],),
        ]
    );
}

#[test]
fn collects_extended_svelte_template_expression_sites() {
    let source = indoc! {r#"
        <script lang="ts">
          import { t } from "@lingui/core/macro";
          const items: string[] = [];
          const promise: Promise<string> = Promise.resolve("ok");
          const html: string = "";
          const key: string = "id";
          const visible: boolean = true;
        </script>

        {#if t`if-condition`}
          <div />
        {:else if t`else-if-condition`}
          <div />
        {/if}
        {#each items.filter(() => true) ?? [t`each-source`] as item}
          <div />
        {/each}
        {#await promise.then(() => t`await-source`)}
          <div />
        {/await}
        {#key `${key}-${t`key-source`}`}
          <div />
        {/key}
        {@html t`html-source`}
        {@render t`render-source`}
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let kinds = analysis
        .template_expressions
        .iter()
        .map(|expression| expression.candidates.len())
        .collect::<Vec<_>>();

    assert_eq!(kinds, vec![1, 1, 1, 1, 1, 1, 1]);
    assert!(
        analysis
            .template_expressions
            .iter()
            .all(|expression| expression.candidates[0].imported_name == "t")
    );
}

#[test]
fn keeps_outer_macro_when_javascript_macros_are_nested() {
    let source = indoc! {r#"
        <script lang="ts">
          import { msg, t } from "@lingui/core/macro";

          const loaded = t(msg`Loaded ${count} items.`);
        </script>
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let script = &analysis.scripts[0];

    assert_eq!(script.candidates.len(), 1);
    assert_eq!(script.candidates[0].imported_name, "t");
    assert_eq!(
        script.candidates[0].kind,
        MacroCandidateKind::CallExpression
    );
}
