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
  /*i18n*/ {
    id: "grYdd0",
    message: "\u3088\u3046\u3053\u305D {readerName}",
    values: {
      readerName: readerName
    }
  }));
  const summary = $derived(
    $__l4s_translate(
    /*i18n*/
    // Note that this method is actually not recommended for complex messages with multiple variables.
    // It's better to use `select` or `plural` for such cases.
    {
      id: "DSRd7/",
      message: "\u53C2\u7167\u4E2D\u306E\u30D1\u30B9\u306F {0} \u3067\u3001\u5019\u88DC\u306F {1} \u3067\u3059\u3002",
      values: {
        0: String(selectedPath ?? __l4s_getI18n()._(
        /*i18n*/ {
          id: "ggPEgU",
          message: "\u672A\u8A2D\u5B9A"
        })),
        1: String(relatedPaths[1] ?? __l4s_getI18n()._(
        /*i18n*/ {
          id: "gkv1jV",
          message: "\u3042\u308A\u307E\u305B\u3093"
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
    <L4sRuntimeTrans />
  </p>
  <ul class="grid gap-2">
    {#each relatedPaths as path}
      <li class="rounded border px-3 py-2">
        {$__l4s_translate(
        /*i18n*/ {
          id: "AUUW5v",
          message: "\u5019\u88DC\u30D1\u30B9: {0}",
          values: {
            0: String(path ?? "")
          }
        })}
      </li>
    {/each}
  </ul>
</main>
