import type { MessageDescriptor } from "@lingui/core";

import RuntimeTransComponent from "./trans/RuntimeTrans.astro";
import type { TransComponentMap } from "./trans/rich-text.ts";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";

export {
  getLinguiContext,
  LINGUI_ASTRO_CONTEXT,
  setLinguiContext,
  type AstroLike,
  type LinguiContext,
} from "./core/context.ts";
export {
  formatRichTextTranslation,
  type TransComponentDescriptor,
  type TransComponentMap,
  type TransRenderNode,
} from "./trans/rich-text.ts";
export {
  mergeRuntimeTransValues,
  translateRuntimeTrans,
} from "./trans/trans-descriptor.ts";

interface RuntimeTransProps {
  id?: string | undefined;
  message?: MessageDescriptor | string | undefined;
  values?: Readonly<Record<string, unknown>> | undefined;
  components?: TransComponentMap | undefined;
}

export const RuntimeTrans = RuntimeTransComponent as (
  props: RuntimeTransProps,
) => unknown satisfies (props: RuntimeTransProps) => any;
