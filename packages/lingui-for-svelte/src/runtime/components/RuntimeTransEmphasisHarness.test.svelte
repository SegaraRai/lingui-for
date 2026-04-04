<script lang="ts">
  import type { I18n } from "@lingui/core";
  import { untrack, type Snippet } from "svelte";

  import { setLinguiContext } from "../core/context.ts";
  import RuntimeTrans from "./RuntimeTrans.svelte";

  let {
    getI18n,
    id,
    message,
    values = undefined,
  }: {
    getI18n: () => I18n;
    id: string;
    message?: string | undefined;
    values?: Readonly<Record<string, unknown>> | undefined;
  } = $props();

  setLinguiContext(untrack(() => getI18n()));
</script>

<RuntimeTrans {id} {message} {values}>
  {#snippet component_0(children: Snippet | undefined)}
    <em>{@render children?.()}</em>
  {/snippet}
</RuntimeTrans>
