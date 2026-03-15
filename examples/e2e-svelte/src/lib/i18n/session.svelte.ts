import { setupI18n } from "@lingui/core";

import { catalogs } from "./catalogs";
import type { SupportedLocale } from "./locale";
export { supportedLocales, type SupportedLocale } from "./locale";

export const appI18n = setupI18n();

const localeState = $state({
  current: "en" as SupportedLocale,
});

let initialized = false;

export function ensureLocale(
  locale: SupportedLocale = localeState.current,
): void {
  if (!initialized || localeState.current !== locale) {
    activateLocale(locale);
  }
}

export function activateLocale(locale: SupportedLocale): void {
  localeState.current = locale;
  appI18n.loadAndActivate({
    locale,
    messages: catalogs[locale],
  });
  initialized = true;
}
