import type { I18n, MessageDescriptor } from "@lingui/core";
import { derived, type Readable } from "svelte/store";

export type Translate = (message: MessageDescriptor) => string;

export type TranslationStore = Readable<Translate> &
  Translate & {
    raw: Translate;
  };

function bindTranslate(instance: I18n): Translate {
  return (message) => instance._(message);
}

export function createTranslationStore(
  getStore: () => Readable<I18n>,
  getRawI18n: () => I18n,
): TranslationStore {
  const raw: Translate = (message) => getRawI18n()._(message);
  const store = raw as TranslationStore;

  store.raw = raw;
  store.subscribe = (run) =>
    derived(getStore(), (instance) => bindTranslate(instance)).subscribe(run);

  return store;
}
