<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    href,
    children,
  }: {
    href: string;
    children?: Snippet;
  } = $props();
</script>

<a class="fixture-link" data-kind="fixture-link" {href}>
  {@render children?.()}
</a>
