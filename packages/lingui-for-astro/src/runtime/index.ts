import type { MessageDescriptor } from "@lingui/core";

import RuntimeTransComponent from "./components/RuntimeTrans.astro";
import type { TransComponentMap } from "./components/rich-text.ts";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";

export {
  formatRichTextTranslation,
  type TransComponentDescriptor,
  type TransComponentMap,
  type TransRenderNode,
} from "./components/rich-text.ts";
export {
  mergeRuntimeTransValues,
  translateRuntimeTrans,
} from "./components/trans-descriptor.ts";
export {
  getLinguiContext,
  LINGUI_ASTRO_CONTEXT,
  setLinguiContext,
  type AstroLike,
  type LinguiContext,
} from "./core/context.ts";

/**
 * Props accepted by the runtime `<RuntimeTrans>` component.
 *
 * This component is the low-level target produced by macro compilation. Applications should prefer
 * authoring with `lingui-for-astro/macro` and let the compiler emit `RuntimeTrans` automatically.
 */
interface RuntimeTransProps {
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
}

/**
 * Low-level runtime translation component used by compiled Astro output.
 *
 * Most applications should not render this directly. Prefer the macro authoring API and treat
 * `RuntimeTrans` as an implementation detail of the compiled output.
 */
export const RuntimeTrans = RuntimeTransComponent as (
  props: RuntimeTransProps,
) => unknown;
