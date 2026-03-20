import type { I18n } from "@lingui/core";
import { getContext, setContext } from "svelte";
import { readable, type Readable } from "svelte/store";

import {
  createTranslationStore,
  type Translate,
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

/**
 * Lazy runtime accessors used by generated code inside the same component that initializes Lingui.
 *
 * The generated Svelte prelude can safely capture this object before user initialization runs and
 * then call {@link LinguiAccessors.prime} at the end of the instance script to lock in the active
 * context once setup code has finished.
 */
export type LinguiAccessors = {
  /**
   * Returns the active Lingui instance once component setup has installed it in context.
   */
  getI18n: () => I18n;
  /**
   * Reactive translation store used by generated code for locale-aware updates.
   */
  _: TranslationStore;
  /**
   * Resolves and memoizes the current context immediately.
   *
   * Generated code calls this at the end of the instance script so markup uses a stable context
   * after user initialization helpers have run.
   */
  prime: () => LinguiContext;
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
  const i18nStore = createI18nStore(instance);

  return {
    i18n: instance,
    _: createTranslationStore(i18nStore, instance),
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
  const context = getContext<LinguiContext>(LINGUI_CONTEXT);
  if (!context) {
    throw new Error(
      "Lingui context not found. Make sure to call setLinguiContext() at the root of your component tree.",
    );
  }
  return context;
}

/**
 * Creates lazy accessors for the current Lingui context.
 *
 * Unlike {@link getLinguiContext}, this helper does not read Svelte context immediately. Generated
 * component code can therefore install these accessors before user initialization logic and only
 * resolve the actual context once that setup is complete.
 */
export function createLinguiAccessors(): LinguiAccessors {
  let cached: LinguiContext | null = null;

  const resolve = (): LinguiContext => {
    cached ??= getLinguiContext();
    return cached;
  };

  const translate = ((...args: Parameters<Translate>) =>
    resolve()._(...args)) as TranslationStore;
  translate.subscribe = (run) => resolve()._.subscribe(run);

  return {
    getI18n: () => resolve().i18n,
    _: translate,
    prime: resolve,
  };
}
