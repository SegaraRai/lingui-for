<script lang="ts">
  import { formatRichTextTranslation } from "lingui-for-shared/runtime";

  import { getLinguiContext } from "../core/context.ts";
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import type { TransComponentMap } from "./types.ts";

  let {
    id,
    message,
    values = {},
    components,
  }: {
    id: string;
    message?: string | undefined;
    values?: Readonly<Record<string, unknown>> | undefined;
    components?: TransComponentMap | undefined;
  } = $props();

  const { _ } = getLinguiContext();

  const translated = $derived.by(() => {
    const options = message != null ? { message } : {};
    return $_(id, values, options);
  });

  const richTextNodes = $derived(
    components ? formatRichTextTranslation(translated, components) : [],
  );
</script>

{#if components}
  <RenderTransNodes nodes={richTextNodes} {components} />
{:else}
  {translated}
{/if}
