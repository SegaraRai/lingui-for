import { messages as en } from "./locales/en";
import { messages as ja } from "./locales/ja";

import type { SupportedLocale } from "./locale";

export const catalogs = {
  en,
  ja,
} satisfies Record<SupportedLocale, typeof en>;
