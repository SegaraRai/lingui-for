<script lang="ts">
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import RenderTransSnippet from "./RenderTransSnippet.svelte";
  import type { TransComponentSnippetMap, TransRenderNode } from "./types.ts";

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
    {@const snippet = snippets.get(node.placeholder)}
    {#if snippet}
      <RenderTransSnippet {snippet} nodes={node.children} {snippets} />
    {:else}
      {#if import.meta.env.DEV}
        {@const _ = void console.warn(
          `[lingui-for-svelte] No snippet found for placeholder "${node.placeholder}". Make sure your translation includes the correct placeholder.`,
        )}
      {/if}
      <RenderTransNodes nodes={node.children} {snippets} />
    {/if}
  {/if}
{/each}
