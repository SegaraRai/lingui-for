import type { I18n, MessageDescriptor } from "@lingui/core";
import { derived, type Readable } from "svelte/store";

/**
 * Function signature used by runtime translation helpers.
 *
 * Callers pass a Lingui message descriptor and receive the translated string for the currently
 * active locale.
 */
export type Translate = (message: MessageDescriptor) => string;

/**
 * Readable store whose current value is also directly callable as a translation function.
 *
 * In a `.svelte` component this enables both direct calls such as `translate(message)` and
 * store-based reactivity through the `$translate(...)` form.
 */
export type TranslationStore = Readable<Translate> & Translate;

function bindTranslate(instance: I18n): Translate {
  return (message) => instance._(message);
}

/**
 * Creates a callable readable store that always translates using the latest `i18n` instance.
 *
 * @param getStore Returns a store that emits whenever the active `i18n` instance should trigger
 * reactive updates.
 * @param getRawI18n Returns the current `i18n` instance for direct function-style calls.
 * @returns A store/function hybrid used by runtime translation helpers and generated code.
 *
 * The returned object is the runtime basis for `$t(...)`-style reactivity inside compiled Svelte
 * components.
 */
export function createTranslationStore(
  getStore: () => Readable<I18n>,
  getRawI18n: () => I18n,
): TranslationStore {
  const store = ((message: MessageDescriptor) =>
    getRawI18n()._(message)) as TranslationStore;
  store.subscribe = (run) =>
    derived(getStore(), (instance) => bindTranslate(instance)).subscribe(run);

  return store;
}
