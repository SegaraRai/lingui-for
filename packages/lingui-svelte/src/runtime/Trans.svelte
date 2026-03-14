<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import { getLinguiContext } from "./index";
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import {
    formatRichTextTranslation,
    type TransComponentMap,
  } from "./rich-text";

  let {
    id,
    message,
    values = {},
    components,
  }: {
    id?: string;
    message: MessageDescriptor | string;
    values?: Record<string, unknown>;
    components?: TransComponentMap;
  } = $props();

  const { _ } = getLinguiContext();

  const descriptor = $derived.by((): MessageDescriptor => {
    if (typeof message === "string") {
      return {
        id: id ?? message,
        message,
      };
    }

    return message;
  });

  const translated = $derived(
    $_({
      ...descriptor,
      values: {
        ...(descriptor.values ?? {}),
        ...values,
      },
    }),
  );

  const richTextNodes = $derived(
    components ? formatRichTextTranslation(translated, components) : [],
  );
</script>

{#if components}
  <RenderTransNodes nodes={richTextNodes} {components} />
{:else}
  {translated}
{/if}
