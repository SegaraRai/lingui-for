import { setupI18n } from "@lingui/core";

import { setLinguiContext } from "lingui-for-svelte";

const catalog = {
  en: (await import("../../i18n/locales/en.ts")).messages,
  ja: (await import("../../i18n/locales/ja.ts")).messages,
};

export type Locale = "en" | "ja";

export function initializeI18n(getLocale: () => Locale): void {
  const i18n = setupI18n({
    locale: getLocale(),
    messages: catalog,
  });

  setLinguiContext(i18n);

  $effect(() => {
    const locale = getLocale();

    i18n.load(locale, catalog[locale]);
    i18n.activate(locale);
  });
}
