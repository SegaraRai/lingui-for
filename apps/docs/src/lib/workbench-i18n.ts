import { setupI18n } from "@lingui/core";

import { setLinguiContext } from "lingui-for-astro/runtime";

import { messages as enMessages } from "../i18n/locales/en.ts";

const workbenchI18n = setupI18n({
  locale: "en",
  messages: {
    en: enMessages,
  },
});

export function ensureWorkbenchLinguiContext(locals: object): void {
  setLinguiContext(locals, workbenchI18n);
}
