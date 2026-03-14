import {
  i18n,
  setupI18n,
  type AllMessages,
  type I18n,
  type Locale,
  type Locales,
  type MessageDescriptor,
  type Messages,
} from "@lingui/core";
import { getContext, hasContext, setContext, type Component } from "svelte";
import { readable, type Readable } from "svelte/store";

import TransComponent from "./Trans.svelte";
import {
  createTranslationStore,
  type TranslationStore,
} from "./translation-store.ts";

export { i18n } from "@lingui/core";

export type {
  AllMessages,
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";

const I18N_CONTEXT = Symbol.for("lingui-svelte.i18n");
const I18N_STORE_CONTEXT = Symbol.for("lingui-svelte.i18n.store");

export type LinguiRuntime = {
  i18n: I18n;
  _: I18n["_"];
  t: TranslationStore;
};

export type CreateI18nOptions = Parameters<typeof setupI18n>[0];

export type LoadAndActivateOptions = {
  locale: Locale;
  locales?: Locales;
  messages: Messages;
};

function bindI18n(instance: I18n): LinguiRuntime {
  return {
    i18n: instance,
    _: instance._.bind(instance),
    t: createTranslationStore(
      () => createI18nStore(instance),
      () => instance,
    ),
  };
}

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

function getContextStoreOrFallback(): Readable<I18n> {
  try {
    return hasContext(I18N_STORE_CONTEXT)
      ? getContext(I18N_STORE_CONTEXT)
      : i18nStore;
  } catch {
    return i18nStore;
  }
}

function getContextI18nOrFallback(): I18n {
  try {
    return hasContext(I18N_CONTEXT) ? getContext(I18N_CONTEXT) : i18n;
  } catch {
    return i18n;
  }
}

export const i18nStore = createI18nStore(i18n);

export const t = createTranslationStore(
  () => getContextStoreOrFallback(),
  () => getContextI18nOrFallback(),
);

export const locale = readable(i18n.locale, (set) => {
  const update = () => {
    set(i18n.locale);
  };

  update();
  i18n.on("change", update);
  return () => {
    i18n.removeListener("change", update);
  };
});

export const Trans = TransComponent as Component<{
  message: MessageDescriptor;
  values?: Record<string, unknown>;
}>;

export function createI18n(params?: CreateI18nOptions): I18n {
  return setupI18n(params);
}

export function setI18nContext(instance: I18n = i18n): I18n {
  setContext(I18N_CONTEXT, instance);
  setContext(I18N_STORE_CONTEXT, createI18nStore(instance));
  return instance;
}

export function getI18n(): I18n {
  return hasContext(I18N_CONTEXT) ? getContext(I18N_CONTEXT) : i18n;
}

export function getI18nStore(): Readable<I18n> {
  return hasContext(I18N_STORE_CONTEXT)
    ? getContext(I18N_STORE_CONTEXT)
    : i18nStore;
}

export function useLingui(): LinguiRuntime {
  return bindI18n(getI18n());
}

export function load(
  localeOrMessages: string | AllMessages,
  messages?: Messages,
): I18n {
  if (typeof localeOrMessages === "string") {
    i18n.load(localeOrMessages, messages ?? {});
    return i18n;
  }

  i18n.load(localeOrMessages);
  return i18n;
}

export function activate(localeName: string, locales?: string[]): I18n {
  i18n.activate(localeName, locales);
  return i18n;
}

export function loadAndActivate(options: LoadAndActivateOptions): I18n {
  i18n.loadAndActivate(options);
  return i18n;
}
