import { messages as en } from "./locales/en";
import { messages as ja } from "./locales/ja";

export const catalogs = {
  en,
  ja,
} as const;

export type SupportedLocale = keyof typeof catalogs;
