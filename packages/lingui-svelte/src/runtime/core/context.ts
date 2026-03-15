import type { I18n } from "@lingui/core";
import { getContext, setContext } from "svelte";
import { readable, type Readable } from "svelte/store";

import {
  createTranslationStore,
  type TranslationStore,
} from "./translation-store.ts";

const LINGUI_CONTEXT = Symbol.for("lingui-for-svelte.context");

/**
 * Runtime context value shared with descendant Svelte components.
 */
export type LinguiContext = {
  /**
   * Stable Lingui instance for imperative translation and runtime helpers.
   */
  i18n: I18n;
  /**
   * Reactive translation store used by generated code for locale-aware updates.
   */
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

function createLinguiContext(instance: I18n): LinguiContext {
  return {
    i18n: instance,
    _: createTranslationStore(
      () => createI18nStore(instance),
      () => instance,
    ),
  };
}

/**
 * Stores a Lingui runtime context for the current Svelte component subtree.
 *
 * @param instance Lingui instance that should back translations for this subtree.
 * @returns The created context value containing both the raw instance and reactive translator.
 *
 * Call this near the root of a translated subtree, such as a layout or provider component.
 */
export function setLinguiContext(instance: I18n): LinguiContext {
  const context = createLinguiContext(instance);
  setContext(LINGUI_CONTEXT, context);
  return context;
}

/**
 * Reads the active Lingui runtime context from the current Svelte component tree.
 *
 * @returns The previously registered Lingui context for this subtree.
 *
 * Generated runtime code calls this to obtain the current `i18n` instance and reactive translator.
 */
export function getLinguiContext(): LinguiContext {
  return getContext<LinguiContext>(LINGUI_CONTEXT);
}
