<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import {
    formatRichTextTranslation,
    getLinguiContext,
    mergeRuntimeTransValues,
    toRuntimeTransDescriptor,
    type TransComponentMap,
  } from "../component-utils";
  import RenderTransNodes from "./RenderTransNodes.svelte";

  let {
    id,
    message,
    values = {},
    components,
  }: {
    id?: string;
    message: MessageDescriptor | string;
    values?: Readonly<Record<string, unknown>>;
    components?: TransComponentMap;
  } = $props();

  const { _ } = getLinguiContext();

  const descriptor = $derived.by(
    (): MessageDescriptor => toRuntimeTransDescriptor(message, id),
  );

  const translated = $derived($_(mergeRuntimeTransValues(descriptor, values)));

  const richTextNodes = $derived(
    components ? formatRichTextTranslation(translated, components) : [],
  );
</script>

{#if components}
  <RenderTransNodes nodes={richTextNodes} {components} />
{:else}
  {translated}
{/if}
