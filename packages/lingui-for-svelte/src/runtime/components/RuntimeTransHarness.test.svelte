<script lang="ts">
  import type { I18n } from "@lingui/core";
  import { untrack } from "svelte";

  import { setLinguiContext } from "../core/context.ts";
  import type { TransComponentMap } from "./rich-text.ts";
  import RuntimeTrans from "./RuntimeTrans.svelte";

  let {
    getI18n,
    id,
    message,
    values = undefined,
    components = undefined,
  }: {
    getI18n: () => I18n;
    id: string;
    message?: string | undefined;
    values?: Readonly<Record<string, unknown>> | undefined;
    components?: TransComponentMap | undefined;
  } = $props();

  setLinguiContext(untrack(() => getI18n()));
</script>

<RuntimeTrans {id} {message} {values} {components} />
