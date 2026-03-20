<script lang="ts">
  import type { I18n, MessageDescriptor } from "@lingui/core";
  import { untrack } from "svelte";

  import { setLinguiContext } from "../core/context.ts";
  import type { TransComponentMap } from "./rich-text.ts";
  import RuntimeTrans from "./RuntimeTrans.svelte";

  let {
    getI18n,
    descriptor,
    components = undefined,
  }: {
    getI18n: () => I18n;
    descriptor: MessageDescriptor;
    components?: TransComponentMap | undefined;
  } = $props();

  setLinguiContext(untrack(() => getI18n()));
</script>

<RuntimeTrans {descriptor} {components} />
