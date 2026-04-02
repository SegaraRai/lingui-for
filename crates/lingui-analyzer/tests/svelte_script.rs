#[path = "support/svelte.rs"]
mod svelte_support;

use indoc::indoc;

use lingui_analyzer::{
    MacroCandidateKind, MacroCandidateStrategy, MacroFlavor, SvelteCompilePlan, WhitespaceMode,
    framework::{FrameworkAdapter, svelte::SvelteAdapter},
};

use svelte_support::{analyze_options_for_svelte, svelte_default_conventions};

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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let script = &analysis.scripts[0];

    assert_eq!(script.candidates.len(), 1);
    assert_eq!(script.candidates[0].imported_name, "t");
}

#[test]
fn allocates_unique_runtime_bindings_for_svelte_compile() {
    let source = indoc! {r#"
        <script lang="ts">
          import { t } from "@lingui/core/macro";
          import { Trans } from "lingui-for-svelte/macro";

          const createLinguiAccessors = "taken";
          const __l4s_ctx = "taken";
          const __l4s_getI18n = "taken";
          const __l4s_translate = "taken";
          const L4sRuntimeTrans = "taken";

          const greeting = t.eager({ id: "hello", message: "Hello" });
        </script>

        <Trans id="welcome" message="Welcome" />
    "#};

    let plan = SvelteCompilePlan::build(
        source,
        "Component.svelte",
        "Component.svelte?compile",
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
    )
    .expect("compile plan succeeds");

    assert_eq!(
        plan.runtime_bindings.create_lingui_accessors,
        "createLinguiAccessors_1"
    );
    assert_eq!(plan.runtime_bindings.context, "__l4s_ctx_1");
    assert_eq!(plan.runtime_bindings.get_i18n, "__l4s_getI18n_1");
    assert_eq!(plan.runtime_bindings.translate, "__l4s_translate_1");
    assert_eq!(plan.runtime_bindings.trans_component, "L4sRuntimeTrans_1");
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");

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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("svelte analysis should succeed");
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
          import { Trans as T } from "lingui-for-svelte/macro";
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
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

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let script = &analysis.scripts[0];

    assert_eq!(script.candidates.len(), 2);
    assert_eq!(script.candidates[0].imported_name, "t");
    assert_eq!(
        script.candidates[0].strategy,
        MacroCandidateStrategy::Standalone
    );
    assert_eq!(
        script.candidates[0].kind,
        MacroCandidateKind::CallExpression
    );
    assert_eq!(script.candidates[1].imported_name, "msg");
    assert_eq!(
        script.candidates[1].strategy,
        MacroCandidateStrategy::OwnedByParent
    );
    assert_eq!(
        script.candidates[1].owner_id,
        Some(script.candidates[0].id.clone())
    );
}

#[test]
fn marks_deeply_nested_script_core_macros_as_owned_by_the_outer_reactive_macro() {
    let source = indoc! {r#"
        <script lang="ts">
          import { plural, select, selectOrdinal, t } from "lingui-for-svelte/macro";

          let count = $state(0);
          let rank = $state(1);
          let role = $state("admin");

          const deepCore = $derived($t({
            message: plural(count, {
              0: selectOrdinal(rank, {
                1: select(role, {
                  admin: "core zero first admin",
                  other: "core zero first other",
                }),
                other: select(role, {
                  admin: "core zero later admin",
                  other: "core zero later other",
                }),
              }),
              other: selectOrdinal(rank, {
                1: select(role, {
                  admin: "core many first admin",
                  other: "core many first other",
                }),
                other: select(role, {
                  admin: "core many later admin",
                  other: "core many later other",
                }),
              }),
            }),
          }));
        </script>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let script = &analysis.scripts[0];
    let standalone = script
        .candidates
        .iter()
        .filter(|candidate| candidate.strategy == MacroCandidateStrategy::Standalone)
        .collect::<Vec<_>>();
    let owned = script
        .candidates
        .iter()
        .filter(|candidate| candidate.strategy == MacroCandidateStrategy::OwnedByParent)
        .collect::<Vec<_>>();

    assert_eq!(standalone.len(), 1);
    assert_eq!(standalone[0].imported_name, "t");
    assert!(
        owned
            .iter()
            .any(|candidate| candidate.imported_name == "plural")
    );
    assert!(
        owned
            .iter()
            .any(|candidate| candidate.imported_name == "selectOrdinal")
    );
    assert!(
        owned
            .iter()
            .any(|candidate| candidate.imported_name == "select")
    );
}

#[test]
fn keeps_full_outer_span_for_later_reactive_plural_template_expressions() {
    let source = indoc! {r##"
        <script lang="ts">
          import { plural, t } from "lingui-for-svelte/macro";

          let locale = $state("en");
          let count = $state(3);
        </script>

        <p>{$t`Init: Preloaded`}</p>
        <h1>{$t`All locales preloaded at init`}</h1>
        <p>{$plural(count, {
          one: "# item in the list.",
          other: "# items in the list.",
        })}</p>
    "##};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("svelte analysis should succeed");
    let plural_expression = analysis
        .template_expressions
        .iter()
        .flat_map(|expression| expression.candidates.iter())
        .find(|candidate| candidate.imported_name == "plural")
        .expect("plural candidate exists");

    let outer = &source[plural_expression.outer_span.start..plural_expression.outer_span.end];
    let normalized =
        &source[plural_expression.normalized_span.start..plural_expression.normalized_span.end];

    assert!(outer.starts_with("$plural("));
    assert!(normalized.starts_with("$plural("));
}

#[test]
fn rejects_unsupported_svelte_trans_child_syntax_with_location() {
    let source = indoc! {r#"
        <script>
          import { Trans } from "lingui-for-svelte/macro";
        </script>

        <Trans>
          {@html content}
        </Trans>
    "#};

    let error = SvelteCompilePlan::build(
        source,
        "Unsupported.svelte",
        "Unsupported.svelte?compile",
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
    )
    .expect_err("compile plan should fail");
    let rendered = error.to_string();

    assert!(rendered.contains("Unsupported.svelte:6:3"));
    assert!(rendered.contains("{@html ...}"));
}
