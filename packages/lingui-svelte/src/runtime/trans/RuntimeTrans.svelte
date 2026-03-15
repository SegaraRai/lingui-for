<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import { getLinguiContext } from "../core/context.ts";
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import {
    formatRichTextTranslation,
    type TransComponentMap,
  } from "./rich-text.ts";
  import {
    mergeRuntimeTransValues,
    toRuntimeTransDescriptor,
  } from "./trans-descriptor.ts";

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
