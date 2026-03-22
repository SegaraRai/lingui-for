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
