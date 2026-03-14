import type { I18n, MessageDescriptor } from "@lingui/core";
import { derived, type Readable } from "svelte/store";

export type Translate = (message: MessageDescriptor) => string;

export type TranslationStore = Readable<Translate> & Translate;

function bindTranslate(instance: I18n): Translate {
  return (message) => instance._(message);
}

export function createTranslationStore(
  getStore: () => Readable<I18n>,
  getRawI18n: () => I18n,
): TranslationStore {
  const store = ((message: MessageDescriptor) => getRawI18n()._(message)) as TranslationStore;
  store.subscribe = (run) =>
    derived(getStore(), (instance) => bindTranslate(instance)).subscribe(run);

  return store;
}
