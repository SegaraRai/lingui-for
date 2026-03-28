import { setupI18n } from "@lingui/core";

import { setLinguiContext } from "lingui-for-astro";

import { messages as enMessages } from "../i18n/locales/docs/en.ts";
import { messages as jaMessages } from "../i18n/locales/docs/ja.ts";

const messages = {
  en: enMessages,
  ja: jaMessages,
};

export type DocsLocale = keyof typeof messages;

export function ensureDocsLinguiContext(
  locals: object,
  language: DocsLocale,
): void {
  setLinguiContext(
    locals,
    setupI18n({
      locale: language,
      messages,
    }),
  );
}
