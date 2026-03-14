import { setupI18n, type I18n, type MessageDescriptor } from "@lingui/core";
import { getContext, setContext, type Component } from "svelte";

import { createLinguiContext, type LinguiContext } from "./context.ts";
import type { TransComponentMap } from "./rich-text.ts";
import TransComponent from "./Trans.svelte";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";
export type { LinguiContext } from "./context.ts";
export type { TransComponentDescriptor, TransComponentMap } from "./rich-text.ts";

export type CreateI18nOptions = Parameters<typeof setupI18n>[0];

const LINGUI_CONTEXT = Symbol.for("lingui-for-svelte.context");

export const Trans = TransComponent as Component<{
  id?: string;
  message: MessageDescriptor | string;
  values?: Record<string, unknown>;
  components?: TransComponentMap;
}>;

export function createI18n(params?: CreateI18nOptions): I18n {
  return setupI18n(params);
}

export function setLinguiContext(instance: I18n): LinguiContext {
  const context = createLinguiContext(instance);
  setContext(LINGUI_CONTEXT, context);
  return context;
}

export function getLinguiContext(): LinguiContext {
  return getContext<LinguiContext>(LINGUI_CONTEXT);
}
