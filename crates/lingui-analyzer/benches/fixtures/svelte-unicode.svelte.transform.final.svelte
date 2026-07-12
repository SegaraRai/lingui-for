<svelte:options runes={true} />

<script lang="ts">
  import { RuntimeTrans as L4sRuntimeTrans, createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
  const __l4s_ctx = createLinguiAccessors();
  const __l4s_getI18n = __l4s_ctx.getI18n;
  const __l4s_translate = __l4s_ctx._;
  const readerName = $state("世界👨‍👩‍👧‍👦😀😃😄");
  const localeLabel = $state("日本語");
  const selectedPath = $state<string | null>("/資料/レビュー/案内😀.md");
  const relatedPaths = $state([
    "/資料/概要.md",
    "/案内/導入👨‍👩‍👧‍👦.md",
    "/履歴/更新🙂.md",
  ]);

  const headline = $derived($__l4s_translate(
  /** i18n */
  {
    id: "grYdd0",
    message: "ようこそ {readerName}",
    values: {
      readerName: readerName
    }
  }));
  const summary = $derived(
    $__l4s_translate(
    /** i18n */
    // Note that this method is actually not recommended for complex messages with multiple variables.
    // It's better to use `select` or `plural` for such cases.
    {
      id: "DSRd7_",
      message: "参照中のパスは {0} で、候補は {1} です。",
      values: {
        0: String(selectedPath ?? __l4s_getI18n()._(
        /** i18n */
        {
          id: "ggPEgU",
          message: "未設定"
        })),
        1: String(relatedPaths[1] ?? __l4s_getI18n()._(
        /** i18n */
        {
          id: "gkv1jV",
          message: "ありません"
        }))
      }
    }),
  );

  __l4s_ctx.prime();
</script>

<main class="grid gap-4 p-6">
  <h1 class="text-2xl font-semibold">{headline}</h1>
  <p class="text-sm">{summary}</p>
  <p class="text-sm">
    <L4sRuntimeTrans {.../** i18n */
    {
      id: "fgdhx6",
      message: "ロケール <0>{localeLabel}</0> で <1>{0}</1> を確認しています。",
      values: {
        0: String(selectedPath ?? ""),
        localeLabel: localeLabel
      }
    }}>
    {#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}
    {#snippet component_1(children)}<span>{@render children?.()}</span>{/snippet}
    </L4sRuntimeTrans>
  </p>
  <ul class="grid gap-2">
    {#each relatedPaths as path}
      <li class="rounded border px-3 py-2">
        {$__l4s_translate(
        /** i18n */
        {
          id: "AUUW5v",
          message: "候補パス: {0}",
          values: {
            0: String(path ?? "")
          }
        })}
      </li>
    {/each}
  </ul>
</main>
