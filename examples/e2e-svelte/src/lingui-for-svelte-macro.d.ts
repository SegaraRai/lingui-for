declare module "lingui-for-svelte/macro" {
  import {
    defineMessage,
    msg,
    ph,
    plural as linguiPlural,
    select as linguiSelect,
    selectOrdinal as linguiSelectOrdinal,
    t as linguiT,
  } from "@lingui/core/macro";
  import type { Component, Snippet } from "svelte";
  import type { Readable } from "svelte/store";

  export { defineMessage, msg, ph };

  export const t: Readable<typeof linguiT> & typeof linguiT;
  export const plural: Readable<typeof linguiPlural> & typeof linguiPlural;
  export const select: Readable<typeof linguiSelect> & typeof linguiSelect;
  export const selectOrdinal: Readable<typeof linguiSelectOrdinal> &
    typeof linguiSelectOrdinal;

  export const Trans: Component<{
    id?: string;
    comment?: string;
    context?: string;
    children?: Snippet;
  }>;
}
