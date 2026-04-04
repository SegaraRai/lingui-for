#[path = "support/astro_conventions.rs"]
mod astro_support;
#[path = "support/svelte_conventions.rs"]
mod svelte_support;

use sourcemap::DecodedMap;

use lingui_analyzer::{
    AstroCompilePlan, CompileTargetContext, CompileTargetOutputKind, CompileTranslationMode,
    SvelteCompilePlan, SvelteFinishCompileOptions, TransformedPrograms, WhitespaceMode,
    build_synthetic_module_for_framework, finish_svelte_compile,
};

use astro_support::astro_default_conventions;
use svelte_support::svelte_default_conventions;

#[test]
fn builds_common_svelte_compile_plan_with_runtime_metadata() {
    let source = r#"
<script module lang="ts">
  import { t } from "@lingui/core/macro";

  const moduleLabel = t`Module label`;
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
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
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
            .contains("const __lf_0 = t`Module label`;")
    );
    assert!(
        !plan
            .common
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
            .contains("<strong>{name}</strong>")
    );
    assert!(plan.common.synthetic_source.contains("Hello"));

    let module_target = plan
        .common
        .targets
        .iter()
        .find(|target| target.context == CompileTargetContext::ModuleScript)
        .expect("module target");
    assert_eq!(
        module_target.translation_mode,
        CompileTranslationMode::Lowered
    );
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
        CompileTranslationMode::Contextual
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
        CompileTranslationMode::Contextual
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
        CompileTranslationMode::Contextual
    );
}

#[test]
fn anchors_svelte_runtime_prelude_to_instance_script_import_removal() {
    let source = indoc::indoc! {r#"
        <script module>
          import { t as moduleT } from "@lingui/core/macro";

          const moduleLabel = moduleT({ id: "module", message: "Module" });
        </script>

        <script>
          import { t as instanceT } from "lingui-for-svelte/macro";
          let name = "Ada";
        </script>

        <p>{$instanceT`Hello ${name}`}</p>
    "#};

    let plan = SvelteCompilePlan::build(
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?compile.tsx",
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
    )
    .expect("svelte compile plan should build");

    let finished = finish_svelte_compile(&SvelteFinishCompileOptions {
        plan,
        source: source.to_string(),
        transformed_programs: TransformedPrograms::default(),
    })
    .expect("svelte compile should finish");

    let prelude = finished
        .replacements
        .iter()
        .find(|replacement| replacement.declaration_id == "__runtime_prelude")
        .expect("runtime prelude replacement exists");
    let map_json = prelude.source_map_json.as_ref().expect("map exists");
    let decoded = DecodedMap::from_reader(map_json.as_bytes()).expect("source map decodes");
    let token = decoded.lookup_token(0, 0).expect("mapping exists");
    let original_offset = utf16_column_to_byte_offset(
        source,
        token.get_src_line() as usize,
        token.get_src_col() as usize,
    );

    assert_eq!(token.get_source(), Some("/virtual/App.svelte"));
    assert!(
        source[original_offset..]
            .trim_start()
            .starts_with("import { t as instanceT }"),
        "runtime prelude should anchor to the instance script import, got: {}",
        &source[original_offset..source.len().min(original_offset + 40)]
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
        WhitespaceMode::Astro,
        astro_default_conventions(),
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
            .contains("<strong>{name}</strong>")
    );
    assert!(plan.common.synthetic_source.contains("Before"));
    assert!(plan.common.synthetic_source.contains("After"));
    assert!(
        plan.common
            .targets
            .iter()
            .all(|target| { target.translation_mode == CompileTranslationMode::Contextual })
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
fn avoids_duplicate_astro_template_targets_for_attribute_conditional_expression() {
    let source = r#"---
import { t } from "lingui-for-astro/macro";

const control = {
  id: "query",
  label: "Query",
  placeholder: "Search docs",
};
---

<label for={control.id}>{t(control.label)}</label>
<input
  id={control.id}
  placeholder={control.placeholder ? t(control.placeholder) : undefined}
/>
"#;

    let plan = AstroCompilePlan::build(
        source,
        "/virtual/ControlField.astro",
        "/virtual/ControlField.astro?compile.tsx",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect("astro compile plan should build");

    let placeholder_targets = plan
        .common
        .targets
        .iter()
        .filter(|target| {
            &source[target.original_span.start..target.original_span.end]
                == "t(control.placeholder)"
        })
        .collect::<Vec<_>>();

    assert_eq!(placeholder_targets.len(), 1);
    assert_eq!(plan.common.targets.len(), 2);
}

#[test]
fn keeps_nested_astro_component_targets_inside_html_interpolations() {
    let source = r#"---
import { Trans } from "lingui-for-astro/macro";

const showDemo = true;
---

<div>{showDemo ? <Trans>See full demo</Trans> : null}</div>
"#;

    let plan = AstroCompilePlan::build(
        source,
        "/virtual/Nested.astro",
        "/virtual/Nested.astro?compile.tsx",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect("astro compile plan should build");

    let component_targets = plan
        .common
        .targets
        .iter()
        .filter(|target| target.output_kind == CompileTargetOutputKind::Component)
        .collect::<Vec<_>>();

    assert_eq!(component_targets.len(), 1);
    assert_eq!(
        &source[component_targets[0].original_span.start..component_targets[0].original_span.end],
        "<Trans>See full demo</Trans>"
    );
}

#[test]
fn keeps_multiline_plural_targets_inside_astro_html_interpolations() {
    let source = r##"---
import { plural } from "lingui-for-astro/macro";
---

<p class="text-base-content/70">
  {
    plural(3, {
      one: "# Astro format sample",
      other: "# Astro format samples",
    })
  }
</p>
"##;

    let plan = AstroCompilePlan::build(
        source,
        "/virtual/Formats.astro",
        "/virtual/Formats.astro?compile.tsx",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect("astro compile plan should build");

    let plural_targets = plan
        .common
        .targets
        .iter()
        .filter(|target| {
            &source[target.original_span.start..target.original_span.end]
                == "plural(3, {\n      one: \"# Astro format sample\",\n      other: \"# Astro format samples\",\n    })"
        })
        .collect::<Vec<_>>();

    let target_spans = plan
        .common
        .targets
        .iter()
        .map(|target| &source[target.original_span.start..target.original_span.end])
        .collect::<Vec<_>>();

    assert_eq!(plural_targets.len(), 1, "{target_spans:#?}");
}

#[test]
fn keeps_astro_callback_body_targets_inside_mixed_html_interpolations() {
    let source = r#"---
import { msg, t as translate } from "@lingui/core/macro";

const filteredQueue = queueItems;
---

{
  filteredQueue.map((item) => {
    const nestedLabel =
      item.unread > 0
        ? translate(
            msg`${item.owner} left ${String(item.comments)} comments while ${item.assignee} still has ${String(item.unread)} unread updates.`,
          )
        : translate(
            msg`${item.owner} left ${String(item.comments)} comments and the queue is fully read.`,
          );

    return <p>{nestedLabel}</p>;
  })
}
"#;

    let plan = AstroCompilePlan::build(
        source,
        "/virtual/NestedCallback.astro",
        "/virtual/NestedCallback.astro?compile.tsx",
        WhitespaceMode::Astro,
        astro_default_conventions(),
    )
    .expect("astro compile plan should build");

    let nested_label_targets = plan
        .common
        .targets
        .iter()
        .filter(|target| {
            let text = &source[target.original_span.start..target.original_span.end];
            text.starts_with("translate(")
                && (text.contains("still has") || text.contains("fully read"))
        })
        .collect::<Vec<_>>();

    assert_eq!(nested_label_targets.len(), 2);
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
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
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
        source,
        "/virtual/App.svelte",
        "/virtual/App.svelte?extract.tsx",
        None,
        &svelte_default_conventions(),
    )
    .expect_err("bare direct plural should be rejected in svelte extraction");

    assert!(
        error
            .to_string()
            .contains("Bare `plural` in `.svelte` files is only allowed")
    );
}

#[test]
fn keeps_full_template_target_spans_for_later_svelte_template_expressions() {
    let source = indoc::indoc! {r##"
        <script lang="ts">
          import { plural, t } from "lingui-for-svelte/macro";

          let locale = $state("en");
          let count = $state(3);
        </script>

        <section>
          <p>{$t`Init: Preloaded`}</p>
          <h1>{$t`All locales preloaded at init`}</h1>
          <p>{$t`This widget has its own i18n context.`}</p>
          <div>
            <p>{$t`Hello from the preloaded init pattern.`}</p>
            <p>
              {$plural(count, {
                one: "# item in the list.",
                other: "# items in the list.",
              })}
            </p>
          </div>
        </section>
    "##};

    let plan = SvelteCompilePlan::build(
        source,
        "/virtual/+page.svelte",
        "/virtual/+page.svelte?compile.tsx",
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
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
        "expected a full-span target for the later template t expression",
    );
    assert!(
        template_targets.iter().any(|target| {
            source[target.original_span.start..target.original_span.end].starts_with("$plural(")
        }),
        "expected a full-span target for the later template plural expression",
    );
}

#[test]
fn normalizes_owned_nested_svelte_macros_in_compile_synthetic_source() {
    let source = indoc::indoc! {r#"
        <script lang="ts">
          import { msg, t as translate } from "lingui-for-svelte/macro";

          const summary = $derived(
            $translate(
              msg`参照中のパスは ${String(selectedPath ?? $translate`未設定`)} で、候補は ${String(
                relatedPaths[1] ?? $translate`ありません`,
              )} です。`,
            ),
          );
        </script>
    "#};

    let plan = SvelteCompilePlan::build(
        source,
        "/virtual/Nested.svelte",
        "/virtual/Nested.svelte?compile.tsx",
        WhitespaceMode::Svelte,
        svelte_default_conventions(),
    )
    .expect("svelte compile plan should build");

    assert!(plan.common.synthetic_source.contains("translate`未設定`"));
    assert!(
        plan.common
            .synthetic_source
            .contains("translate`ありません`")
    );
    assert!(!plan.common.synthetic_source.contains("$translate`未設定`"));
    assert!(
        !plan
            .common
            .synthetic_source
            .contains("$translate`ありません`")
    );
}

fn utf16_column_to_byte_offset(source: &str, line: usize, utf16_col: usize) -> usize {
    let line_start = source
        .split_inclusive('\n')
        .take(line)
        .map(str::len)
        .sum::<usize>();
    let line_text = source[line_start..]
        .split_once('\n')
        .map_or(&source[line_start..], |(current_line, _)| current_line);
    let mut units = 0usize;

    for (byte_offset, ch) in line_text.char_indices() {
        if units >= utf16_col {
            return line_start + byte_offset;
        }
        units += ch.len_utf16();
    }

    line_start + line_text.len()
}
