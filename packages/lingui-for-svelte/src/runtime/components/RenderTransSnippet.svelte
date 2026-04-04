<script lang="ts">
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import type {
    TransComponentSnippet,
    TransComponentSnippetMap,
    TransRenderNode,
  } from "./types.ts";

  let {
    snippet,
    nodes,
    snippets,
  }: {
    snippet: TransComponentSnippet;
    nodes: readonly TransRenderNode[];
    snippets: TransComponentSnippetMap;
  } = $props();
</script>

{#if nodes.length === 0}
  {@render snippet(undefined)}
{:else}
  {#snippet children()}
    <RenderTransNodes {nodes} {snippets} />
  {/snippet}
  {@render snippet(children)}
{/if}
