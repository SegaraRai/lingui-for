import type { MessageDescriptor } from "@lingui/core";
import type { Component } from "svelte";

import RuntimeTransComponent from "./trans/RuntimeTrans.svelte";
import type { TransComponentMap } from "./trans/rich-text.ts";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";
export {
  createLinguiAccessors,
  getLinguiContext,
  setLinguiContext,
  type LinguiAccessors,
  type LinguiContext,
} from "./core/context.ts";
export type {
  TransComponentDescriptor,
  TransComponentMap,
} from "./trans/rich-text.ts";

type RuntimeTransType = Component<{
  id?: string | undefined;
  message?: MessageDescriptor | string | undefined;
  values?: Readonly<Record<string, unknown>> | undefined;
  components?: TransComponentMap | undefined;
}>;

export const RuntimeTrans =
  // Type erasure: We cannot re-export Svelte components directly since type definitions for `.svelte` files cannot be generated (as of now)
  // FYI I tried https://github.com/sxzz/tsdown-templates/tree/main/svelte but it doesn't seem to work with our codebase for some reason.
  RuntimeTransComponent satisfies RuntimeTransType as RuntimeTransType;
