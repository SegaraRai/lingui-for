use indoc::indoc;
use lingui_analyzer::{
    MacroFlavor,
    framework::{FrameworkAdapter, svelte::SvelteAdapter},
    synthetic::build_synthetic_module,
};

#[test]
fn builds_synthetic_module_with_normalized_svelte_macros() {
    let source = indoc! {r#"
        <script>
          import { t as tt, plural } from "@lingui/core/macro";

          const direct = tt`Hello`;
          const eager = tt.eager({ id: "msg" });
          const reactive = $plural(count, { one: "item", other: "items" });
        </script>
    "#};

    let analysis = SvelteAdapter.analyze(source).expect("analysis succeeds");
    let script = &analysis.scripts[0];
    let synthetic = build_synthetic_module(source, &script.macro_imports, &script.candidates);

    assert!(
        synthetic
            .source
            .contains("import { t as tt, plural } from \"@lingui/core/macro\";")
    );
    assert!(synthetic.source.contains("const __lf_0 = tt`Hello`;"));
    assert!(
        synthetic
            .source
            .contains("const __lf_1 = tt({ id: \"msg\" });")
    );
    assert!(
        synthetic
            .source
            .contains("const __lf_2 = plural(count, { one: \"item\", other: \"items\" });")
    );

    let flavors = script
        .candidates
        .iter()
        .map(|candidate| candidate.flavor)
        .collect::<Vec<_>>();
    assert_eq!(
        flavors,
        vec![
            MacroFlavor::Direct,
            MacroFlavor::Eager,
            MacroFlavor::Reactive
        ]
    );

    assert_eq!(synthetic.declaration_ids.len(), 3);
    assert_eq!(synthetic.mappings.len(), 3);
    assert!(synthetic.generated_spans["__lf_0"].start < synthetic.generated_spans["__lf_0"].end);
}
