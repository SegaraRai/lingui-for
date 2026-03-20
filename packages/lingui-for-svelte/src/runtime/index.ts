import type { MessageDescriptor } from "@lingui/core";
import type { Component } from "svelte";

import RuntimeTransComponent from "./components/RuntimeTrans.svelte";
import type { TransComponentMap } from "./components/rich-text.ts";

export type {
  TransComponentDescriptor,
  TransComponentMap,
} from "./components/rich-text.ts";
export {
  createLinguiAccessors,
  getLinguiContext,
  setLinguiContext,
  type LinguiAccessors,
  type LinguiContext,
} from "./core/context.ts";

/**
 * Props accepted by the runtime `<RuntimeTrans>` component.
 *
 * This component is the low-level target produced by macro compilation. Applications should prefer
 * authoring with `lingui-for-svelte/macro` and let the compiler emit `RuntimeTrans`
 * automatically.
 */
type RuntimeTransType = Component<{
  /**
   * Lingui descriptor produced by macro lowering.
   */
  descriptor: MessageDescriptor;
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
