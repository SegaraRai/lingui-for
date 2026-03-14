import type { MessageDescriptor } from "@lingui/core";
import type { Component } from "svelte";

import RuntimeTransComponent from "./RuntimeTrans.svelte";
import type { TransComponentMap } from "./rich-text.ts";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";
export {
  getLinguiContext,
  setLinguiContext,
  type LinguiContext,
} from "./context.ts";
export type {
  TransComponentDescriptor,
  TransComponentMap,
} from "./rich-text.ts";

type RuntimeTransType = Component<{
  id?: string;
  message: MessageDescriptor | string;
  values?: Readonly<Record<string, unknown>>;
  components?: TransComponentMap;
}>;

export const RuntimeTrans =
  // Type erasure: We cannot re-export Svelte components since type definitions for `.svelte` files cannot be generated (as of now)
  RuntimeTransComponent satisfies RuntimeTransType as RuntimeTransType;
