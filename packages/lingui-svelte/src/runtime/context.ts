import type { I18n } from "@lingui/core";
import { readable, type Readable } from "svelte/store";

import {
  createTranslationStore,
  type TranslationStore,
} from "./translation-store.ts";

export type LinguiContext = {
  i18n: I18n;
  _: TranslationStore;
};

function createI18nStore(instance: I18n): Readable<I18n> {
  return readable(instance, (set) => {
    const update = (): void => {
      set(instance);
    };

    instance.on("change", update);
    return (): void => {
      instance.removeListener("change", update);
    };
  });
}

export function createLinguiContext(instance: I18n): LinguiContext {
  return {
    i18n: instance,
    _: createTranslationStore(
      () => createI18nStore(instance),
      () => instance,
    ),
  };
}
