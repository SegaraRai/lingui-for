<script lang="ts">
  import type { Snippet } from "svelte";

  import { formatRichTextTranslation } from "@lingui-for/internal-shared-runtime";

  import { getLinguiContext } from "../core/context.ts";
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import type {
    TransComponentSnippet,
    TransComponentSnippetMap,
  } from "./types.ts";

  let {
    id,
    message,
    values = {},
    children: _children,
    ...snippetProps
  }: {
    id: string;
    message?: string | undefined;
    values?: Readonly<Record<string, unknown>> | undefined;
    children?: Snippet | undefined;
    [key: `component_${string}`]: TransComponentSnippet | undefined;
  } = $props();

  const { _ } = getLinguiContext();

  const snippets = $derived.by<TransComponentSnippetMap | null>(() => {
    const entries = Object.entries(snippetProps).flatMap(([name, value]) =>
      name.startsWith("component_") && value != null
        ? ([[name.slice("component_".length), value]] as const)
        : ([] as const),
    );
    if (entries.length === 0) {
      return null;
    }
    return new Map(entries);
  });

  const translated = $derived.by(() => {
    const options = message != null ? { message } : {};
    return $_(id, values, options);
  });

  const richTextNodes = $derived(
    snippets ? formatRichTextTranslation(translated, snippets) : [],
  );
</script>

{#if snippets}
  <RenderTransNodes nodes={richTextNodes} {snippets} />
{:else}
  {translated}
{/if}
