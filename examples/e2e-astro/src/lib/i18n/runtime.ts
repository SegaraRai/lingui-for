import type { I18n } from "@lingui/core";
import { setupI18n } from "@lingui/core";

import { catalogs } from "./catalogs";
import type { SupportedLocale } from "./locale";

export function createAppI18n(locale: SupportedLocale) {
  const i18n = setupI18n();
  syncAppI18n(i18n, locale);
  return i18n;
}

export function syncAppI18n(i18n: I18n, locale: SupportedLocale) {
  i18n.loadAndActivate({
    locale,
    messages: catalogs[locale],
  });
}

export function getLocaleLabel(locale: SupportedLocale): string {
  return locale === "ja" ? "日本語" : "English";
}
