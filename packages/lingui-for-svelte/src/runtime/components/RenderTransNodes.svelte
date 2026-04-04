<script lang="ts">
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import RenderTransSnippet from "./RenderTransSnippet.svelte";
  import type {
    TransComponentSnippet,
    TransComponentSnippetMap,
    TransRenderNode,
  } from "./types.ts";

  let {
    nodes,
    snippets,
  }: {
    nodes: readonly TransRenderNode[];
    snippets: TransComponentSnippetMap;
  } = $props();
</script>

{#each nodes as node, index (typeof node === "string" ? `text:${index}` : node.key)}
  {#if typeof node === "string"}
    {node}
  {:else}
    {@const snippet: TransComponentSnippet | undefined = snippets[node.placeholder]}
    {#if snippet}
      <RenderTransSnippet {snippet} nodes={node.children} {snippets} />
    {:else}
      <RenderTransNodes nodes={node.children} {snippets} />
    {/if}
  {/if}
{/each}
