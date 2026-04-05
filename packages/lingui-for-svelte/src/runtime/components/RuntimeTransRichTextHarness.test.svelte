<script lang="ts">
  import type { I18n } from "@lingui/core";
  import { untrack, type Snippet } from "svelte";

  import { setLinguiContext } from "../core/context.ts";
  import RuntimeTransFixtureLink from "./RuntimeTransFixtureLink.test.svelte";
  import RuntimeTrans from "./RuntimeTrans.svelte";

  let {
    getI18n,
    id,
    message,
    values = undefined,
    href = "/docs",
  }: {
    getI18n: () => I18n;
    id: string;
    message?: string | undefined;
    values?: Readonly<Record<string, unknown>> | undefined;
    href?: string | undefined;
  } = $props();

  setLinguiContext(untrack(() => getI18n()));
</script>

<RuntimeTrans {id} {message} {values}>
  {#snippet component_0(children: Snippet | undefined)}
    <strong class="outer">{@render children?.()}</strong>
  {/snippet}
  {#snippet component_1(children: Snippet | undefined)}
    <RuntimeTransFixtureLink {href}>
      {@render children?.()}
    </RuntimeTransFixtureLink>
  {/snippet}
</RuntimeTrans>
