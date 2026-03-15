<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import { getLinguiContext } from "../core/context.ts";
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import {
    formatRichTextTranslation,
    type TransComponentMap,
  } from "./rich-text.ts";
  import { translateRuntimeTrans } from "./trans-descriptor.ts";

  let {
    id,
    message,
    values = {},
    components,
  }: {
    id?: string | undefined;
    message?: MessageDescriptor | string | undefined;
    values?: Readonly<Record<string, unknown>> | undefined;
    components?: TransComponentMap | undefined;
  } = $props();

  const { i18n, _ } = getLinguiContext();

  const translated = $derived.by(() => {
    $_;
    return translateRuntimeTrans(i18n, message, values, id);
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
