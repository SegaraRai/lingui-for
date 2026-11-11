<script lang="ts">
  import { style } from "stillwind/svelte";
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
  {...style(
    "badge flex-none font-bold border-0",
    {
      warm: "badge-warning",
      cool: "badge-info",
    }[tone],
  )}
>
  {@render children?.()}
</span>
