use indoc::indoc;
use lingui_analyzer::{
    MacroCandidateKind, MacroFlavor,
    framework::{FrameworkAdapter, svelte::SvelteAdapter},
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
    let counts = analysis
        .template_expressions
        .iter()
        .map(|expression| expression.candidates.len())
        .collect::<Vec<_>>();
    let shadowed = analysis
        .template_expressions
        .iter()
        .map(|expression| expression.shadowed_names.clone())
        .collect::<Vec<_>>();

    assert_eq!(
        shadowed,
        vec![
            vec![],
            vec!["t".to_string()],
            vec!["t".to_string()],
            vec!["t".to_string()],
            vec!["t".to_string()],
            vec!["t".to_string()],
            vec!["t".to_string()],
            vec![],
        ]
    );
    assert_eq!(counts, vec![1, 0, 0, 0, 0, 0, 0, 1]);
    assert_eq!(
        analysis.template_expressions[7].candidates[0].imported_name,
        "t"
    );
    assert_eq!(
        analysis.template_expressions[0].candidates[0].imported_name,
        "t"
    );
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
