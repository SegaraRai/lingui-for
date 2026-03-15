<script lang="ts">
  import RenderTransNodes from "./RenderTransNodes.svelte";
  import type { TransComponentMap, TransRenderNode } from "./rich-text.ts";

  let {
    nodes,
    components,
  }: {
    nodes: readonly TransRenderNode[];
    components: TransComponentMap;
  } = $props();
</script>

{#each nodes as node, index (typeof node === "string" ? `text:${index}` : node.key)}
  {#if typeof node === "string"}
    {node}
  {:else}
    {@const component = components[node.name]}
    {#if !component}
      <RenderTransNodes nodes={node.children} {components} />
    {:else if component.kind === "element"}
      <svelte:element this={component.tag} {...component.props}>
        <RenderTransNodes nodes={node.children} {components} />
      </svelte:element>
    {:else}
      {@const DynamicComponent = component.component}
      <DynamicComponent {...component.props}>
        <RenderTransNodes nodes={node.children} {components} />
      </DynamicComponent>
    {/if}
  {/if}
{/each}
