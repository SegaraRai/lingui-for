<svelte:options runes={true} />

<script lang="ts">
  import { msg, t as translate } from "@lingui/core/macro";
  import { Trans } from "lingui-for-svelte/macro";

  const readerName = $state("世界👨‍👩‍👧‍👦😀😃😄");
  const localeLabel = $state("日本語");
  const selectedPath = $state<string | null>("/資料/レビュー/案内😀.md");
  const relatedPaths = $state([
    "/資料/概要.md",
    "/案内/導入👨‍👩‍👧‍👦.md",
    "/履歴/更新🙂.md",
  ]);

  const headline = $derived($translate`ようこそ ${readerName}`);
  const summary = $derived(
    $translate(
      // Note that this method is actually not recommended for complex messages with multiple variables.
      // It's better to use `select` or `plural` for such cases.
      msg`参照中のパスは ${String(selectedPath ?? $translate`未設定`)} で、候補は ${String(
        relatedPaths[1] ?? $translate`ありません`,
      )} です。`,
    ),
  );
</script>

<main class="grid gap-4 p-6">
  <h1 class="text-2xl font-semibold">{headline}</h1>
  <p class="text-sm">{summary}</p>
  <p class="text-sm">
    <Trans>
      ロケール <strong>{localeLabel}</strong> で
      <span>{String(selectedPath ?? "")}</span>
      を確認しています。
    </Trans>
  </p>
  <ul class="grid gap-2">
    {#each relatedPaths as path}
      <li class="rounded border px-3 py-2">
        {$translate(msg`候補パス: ${String(path ?? "")}`)}
      </li>
    {/each}
  </ul>
</main>
