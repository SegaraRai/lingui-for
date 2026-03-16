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

/**
 * Props accepted by the runtime `<RuntimeTrans>` component.
 *
 * This component is the low-level target produced by macro compilation. Applications should prefer
 * authoring with `lingui-for-svelte/macro` and let the compiler emit `RuntimeTrans`
 * automatically.
 */
type RuntimeTransType = Component<{
  /**
   * Explicit message id to translate.
   */
  id?: string | undefined;
  /**
   * Descriptor or default-message string produced by macro lowering.
   */
  message?: MessageDescriptor | string | undefined;
  /**
   * Runtime interpolation values merged into the final descriptor.
   */
  values?: Readonly<Record<string, unknown>> | undefined;
  /**
   * Rich-text component descriptors keyed by placeholder name.
   */
  components?: TransComponentMap | undefined;
}>;

/**
 * Low-level runtime translation component used by compiled Svelte output.
 *
 * Most applications should not render this directly. Prefer the macro authoring API and treat
 * `RuntimeTrans` as an implementation detail of the compiled output.
 */
export const RuntimeTrans =
  // Type erasure: We cannot re-export Svelte components directly since type definitions for `.svelte` files cannot be generated (as of now)
  // FYI I tried https://github.com/sxzz/tsdown-templates/tree/main/svelte but it doesn't seem to work with our codebase for some reason.
  RuntimeTransComponent satisfies RuntimeTransType as RuntimeTransType;
