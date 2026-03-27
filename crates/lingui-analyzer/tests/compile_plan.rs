use std::fs::read_to_string;
use std::path::PathBuf;

use lingui_analyzer::{
    AstroCompilePlan, CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode,
    SvelteCompilePlan, build_synthetic_module_for_framework,
};

#[test]
fn builds_common_svelte_compile_plan_with_runtime_metadata() {
    let source = r#"
<script context="module" lang="ts">
  import { t } from "lingui-for-svelte/macro";

  const moduleLabel = t.eager`Module label`;
</script>

<script lang="ts">
  import { t, Trans } from "lingui-for-svelte/macro";

  let name = $state("Ada");
  const reactiveLabel = $t`Hello ${name}`;
</script>

<p>{$t`Markup ${name}`}</p>
<Trans>Hello <strong>{name}</strong></Trans>
"#;

    let plan = SvelteCompilePlan::build(
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?compile.tsx",
    )
    .expect("svelte compile plan should build");

    assert_eq!(plan.common.source_name, "/virtual/App.svelte");
    assert_eq!(
        plan.common.synthetic_name,
        "/virtual/App.svelte?compile.tsx"
    );
    assert_eq!(plan.common.targets.len(), 4);
    assert!(plan.runtime_requirements.needs_runtime_i18n_binding);
    assert!(plan.runtime_requirements.needs_runtime_trans_component);
    assert!(
        plan.common
            .synthetic_source
            .contains("__lingui_for_svelte_eager_translation__(t`Module label`)")
    );
    assert!(
        plan.common
            .synthetic_source
            .contains("__lingui_for_svelte_reactive_translation__(t`Hello ${name}`, \"t\")")
    );
    assert!(
        plan.common
            .synthetic_source
            .contains("__lingui_for_svelte_reactive_translation__(t`Markup ${name}`, \"t\")")
    );
    assert!(
        plan.common
            .synthetic_source
            .contains("<Trans>Hello <strong>{name}</strong></Trans>")
    );

    let module_target = plan
        .common
        .targets
        .iter()
        .find(|target| target.context == CompileTargetContext::ModuleScript)
        .expect("module target");
    assert_eq!(module_target.translation_mode, CompileTranslationMode::Raw);
    assert_eq!(
        module_target.output_kind,
        CompileTargetOutputKind::Expression
    );

    let instance_target = plan
        .common
        .targets
        .iter()
        .find(|target| {
            target.context == CompileTargetContext::InstanceScript
                && target.output_kind == CompileTargetOutputKind::Expression
        })
        .expect("instance expression target");
    assert_eq!(
        instance_target.translation_mode,
        CompileTranslationMode::Context
    );

    let template_expression_target = plan
        .common
        .targets
        .iter()
        .find(|target| {
            target.context == CompileTargetContext::Template
                && target.output_kind == CompileTargetOutputKind::Expression
        })
        .expect("template expression target");
    assert_eq!(
        template_expression_target.translation_mode,
        CompileTranslationMode::Context
    );

    let component_target = plan
        .common
        .targets
        .iter()
        .find(|target| target.output_kind == CompileTargetOutputKind::Component)
        .expect("component target");
    assert_eq!(component_target.context, CompileTargetContext::Template);
    assert_eq!(
        component_target.translation_mode,
        CompileTranslationMode::Context
    );
}

#[test]
fn builds_common_astro_compile_plan_with_shared_target_shape() {
    let source = r#"---
import { msg, t as translate, Trans } from "lingui-for-astro/macro";

const status = translate(msg`Status summary: active`);
---

<p>{translate`Markup ${name}`}</p>
<Trans>Before <strong>{name}</strong> After</Trans>
"#;

    let plan = AstroCompilePlan::build(
        source,
        "/virtual/Page.astro",
        "/virtual/Page.astro?compile.tsx",
    )
    .expect("astro compile plan should build");

    assert_eq!(plan.common.targets.len(), 3);
    assert!(plan.runtime_requirements.needs_runtime_i18n_binding);
    assert!(plan.runtime_requirements.needs_runtime_trans_component);
    assert!(
        plan.common
            .synthetic_source
            .contains("translate(msg`Status summary: active`)")
    );
    assert!(
        plan.common
            .synthetic_source
            .contains("translate`Markup ${name}`")
    );
    assert!(
        plan.common
            .synthetic_source
            .contains("<Trans>Before <strong>{name}</strong> After</Trans>")
    );
    assert!(
        plan.common
            .targets
            .iter()
            .all(|target| { target.translation_mode == CompileTranslationMode::Context })
    );
    assert!(
        plan.common
            .targets
            .iter()
            .any(|target| target.context == CompileTargetContext::Frontmatter)
    );
    assert!(plan.common.targets.iter().any(|target| {
        target.context == CompileTargetContext::Template
            && target.output_kind == CompileTargetOutputKind::Expression
    }));
    assert!(plan.common.targets.iter().any(|target| {
        target.context == CompileTargetContext::Template
            && target.output_kind == CompileTargetOutputKind::Component
    }));
}

#[test]
fn rejects_bare_direct_t_in_svelte_scripts() {
    let source = r#"
<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  const label = t`Hello`;
</script>
"#;

    let error = SvelteCompilePlan::build(
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?compile.tsx",
    )
    .expect_err("bare direct t should be rejected in svelte scripts");

    assert!(
        error
            .to_string()
            .contains("Bare `t` in `.svelte` files is not allowed")
    );
}

#[test]
fn rejects_bare_direct_plural_in_svelte_extract_synthetic_builds() {
    let source = r##"
<script lang="ts">
  import { plural } from "lingui-for-svelte/macro";

  let count = $state(1);
  const label = plural(count, {
    one: "# Book",
    other: "# Books",
  });
</script>
"##;

    let error = build_synthetic_module_for_framework(
        "svelte",
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?extract.tsx",
    )
    .expect_err("bare direct plural should be rejected in svelte extraction");

    assert!(
        error
            .to_string()
            .contains("Bare `plural` in `.svelte` files is only allowed")
    );
}

#[test]
fn keeps_full_template_target_spans_for_the_e2e_preloaded_page() {
    let source = read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/e2e-svelte/src/routes/playground/init-preloaded/+page.svelte"),
    )
    .expect("e2e fixture source should load");

    let plan = SvelteCompilePlan::build(
        &source,
        "/virtual/+page.svelte",
        "/virtual/+page.svelte?compile.tsx",
    )
    .expect("svelte compile plan should build");

    let template_targets = plan
        .common
        .targets
        .iter()
        .filter(|target| {
            target.context == CompileTargetContext::Template
                && target.output_kind == CompileTargetOutputKind::Expression
        })
        .collect::<Vec<_>>();

    assert!(
        template_targets.iter().any(|target| {
            source[target.original_span.start..target.original_span.end]
                .starts_with("$t`Hello from the preloaded init pattern.`")
        }),
        "expected a full-span target for the later template t expression"
    );
    assert!(
        template_targets.iter().any(|target| {
            source[target.original_span.start..target.original_span.end].starts_with("$plural(")
        }),
        "expected a full-span target for the later template plural expression"
    );
}
