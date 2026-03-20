<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import { getLinguiContext } from "../core/context.ts";
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import {
    formatRichTextTranslation,
    type TransComponentMap,
  } from "./rich-text.ts";

  let {
    descriptor,
    components,
  }: {
    descriptor: MessageDescriptor;
    components?: TransComponentMap | undefined;
  } = $props();

  const { _ } = getLinguiContext();

  const translated = $derived($_(descriptor));

  const richTextNodes = $derived(
    components ? formatRichTextTranslation(translated, components) : [],
  );
</script>

{#if components}
  <RenderTransNodes nodes={richTextNodes} {components} />
{:else}
  {translated}
{/if}
