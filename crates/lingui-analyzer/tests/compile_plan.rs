use lingui_analyzer::{
    CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode,
    build_compile_plan_for_framework_with_names,
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

    let plan = build_compile_plan_for_framework_with_names(
        "svelte",
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?compile.tsx",
    )
    .expect("svelte compile plan should build");

    assert_eq!(plan.framework, "svelte");
    assert_eq!(plan.source_name, "/virtual/App.svelte");
    assert_eq!(plan.synthetic_name, "/virtual/App.svelte?compile.tsx");
    assert_eq!(plan.targets.len(), 4);
    assert!(plan.runtime_requirements.needs_runtime_i18n_binding);
    assert!(plan.runtime_requirements.needs_runtime_trans_component);
    assert!(
        plan.synthetic_source
            .contains("__lingui_for_svelte_eager_translation__(t`Module label`)")
    );
    assert!(
        plan.synthetic_source
            .contains("__lingui_for_svelte_reactive_translation__(t`Hello ${name}`, \"t\")")
    );
    assert!(
        plan.synthetic_source
            .contains("__lingui_for_svelte_reactive_translation__(t`Markup ${name}`, \"t\")")
    );
    assert!(
        plan.synthetic_source
            .contains("<Trans>Hello <strong>{name}</strong></Trans>")
    );

    let module_target = plan
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
        .targets
        .iter()
        .find(|target| {
            target.context == CompileTargetContext::InstanceScript
                && target.output_kind == CompileTargetOutputKind::Expression
        })
        .expect("instance expression target");
    assert_eq!(
        instance_target.translation_mode,
        CompileTranslationMode::SvelteContext
    );

    let template_expression_target = plan
        .targets
        .iter()
        .find(|target| {
            target.context == CompileTargetContext::Template
                && target.output_kind == CompileTargetOutputKind::Expression
        })
        .expect("template expression target");
    assert_eq!(
        template_expression_target.translation_mode,
        CompileTranslationMode::SvelteContext
    );

    let component_target = plan
        .targets
        .iter()
        .find(|target| target.output_kind == CompileTargetOutputKind::Component)
        .expect("component target");
    assert_eq!(component_target.context, CompileTargetContext::Template);
    assert_eq!(
        component_target.translation_mode,
        CompileTranslationMode::SvelteContext
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

    let plan = build_compile_plan_for_framework_with_names(
        "astro",
        source,
        "/virtual/Page.astro",
        "/virtual/Page.astro?compile.tsx",
    )
    .expect("astro compile plan should build");

    assert_eq!(plan.framework, "astro");
    assert_eq!(plan.targets.len(), 3);
    assert!(plan.runtime_requirements.needs_runtime_i18n_binding);
    assert!(plan.runtime_requirements.needs_runtime_trans_component);
    assert!(
        plan.synthetic_source
            .contains("translate(msg`Status summary: active`)")
    );
    assert!(plan.synthetic_source.contains("translate`Markup ${name}`"));
    assert!(
        plan.synthetic_source
            .contains("<Trans>Before <strong>{name}</strong> After</Trans>")
    );
    assert!(
        plan.targets
            .iter()
            .all(|target| { target.translation_mode == CompileTranslationMode::AstroContext })
    );
    assert!(
        plan.targets
            .iter()
            .any(|target| target.context == CompileTargetContext::Frontmatter)
    );
    assert!(plan.targets.iter().any(|target| {
        target.context == CompileTargetContext::Template
            && target.output_kind == CompileTargetOutputKind::Expression
    }));
    assert!(plan.targets.iter().any(|target| {
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

    let error = build_compile_plan_for_framework_with_names(
        "svelte",
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?compile.tsx",
    )
    .expect_err("bare direct t should be rejected in svelte scripts");

    assert!(error.to_string().contains("Bare `t` in `.svelte` files is not allowed"));
}
