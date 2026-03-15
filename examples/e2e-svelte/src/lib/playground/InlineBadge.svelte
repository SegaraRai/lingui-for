<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tone = "warm",
    children,
  }: {
    tone?: "warm" | "cool";
    children?: Snippet;
  } = $props();
</script>

<span
  class="badge border-0 font-bold"
  class:badge-warning={tone === "warm"}
  class:badge-info={tone === "cool"}
>
  {@render children?.()}
</span>
