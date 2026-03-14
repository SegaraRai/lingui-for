import {
  setupI18n,
  type I18n,
  type Locale,
  type Locales,
  type MessageDescriptor,
  type Messages,
} from "@lingui/core";
import { getContext, setContext, type Component } from "svelte";
import { readable, type Readable } from "svelte/store";

import TransComponent from "./Trans.svelte";
import {
  createTranslationStore,
  type TranslationStore,
} from "./translation-store.ts";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";

const LINGUI_CONTEXT = Symbol.for("lingui-svelte.context");

export type LinguiContext = {
  i18n: I18n;
  _: TranslationStore;
};

export type CreateI18nOptions = Parameters<typeof setupI18n>[0];

export const Trans = TransComponent as Component<{
  message: MessageDescriptor;
  values?: Record<string, unknown>;
}>;

function createI18nStore(instance: I18n): Readable<I18n> {
  return readable(instance, (set) => {
    const update = () => {
      set(instance);
    };

    instance.on("change", update);
    return () => {
      instance.removeListener("change", update);
    };
  });
}

function createLinguiContext(instance: I18n): LinguiContext {
  return {
    i18n: instance,
    _: createTranslationStore(
      () => createI18nStore(instance),
      () => instance,
    ),
  };
}

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
