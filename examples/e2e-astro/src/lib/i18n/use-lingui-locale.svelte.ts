import type { I18n } from "@lingui/core";
import { untrack } from "svelte";

import { setLinguiContext } from "lingui-for-svelte";

import type { SupportedLocale } from "./locale";
import { createAppI18n, syncAppI18n } from "./runtime";

export function useLinguiLocale(getLocale: () => SupportedLocale): I18n {
  const i18n = createAppI18n(untrack(getLocale));
  setLinguiContext(i18n);

  $effect(() => {
    syncAppI18n(i18n, getLocale());
  });

  return i18n;
}
