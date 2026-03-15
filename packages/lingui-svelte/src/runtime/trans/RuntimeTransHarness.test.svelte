<script lang="ts">
  import type { I18n, MessageDescriptor } from "@lingui/core";
  import { untrack } from "svelte";

  import { setLinguiContext } from "../core/context.ts";
  import type { TransComponentMap } from "./rich-text.ts";
  import RuntimeTrans from "./RuntimeTrans.svelte";

  let {
    getI18n,
    id = undefined,
    message,
    values = undefined,
    components = undefined,
  }: {
    getI18n: () => I18n;
    id?: string;
    message: MessageDescriptor | string;
    values?: Readonly<Record<string, unknown>>;
    components?: TransComponentMap;
  } = $props();

  setLinguiContext(untrack(() => getI18n()));
</script>

<RuntimeTrans {id} {message} {values} {components} />
