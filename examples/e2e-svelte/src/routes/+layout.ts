import type { LayoutLoad } from "./$types";

import {
  supportedLocales,
  type SupportedLocale,
} from "$lib/i18n/session.svelte";

const fallbackLocale: SupportedLocale = "en";

function isSupportedLocale(value: string | null): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

export const load: LayoutLoad = ({ url }) => {
  const requestedLocale = url.searchParams.get("lang");

  return {
    locale: isSupportedLocale(requestedLocale)
      ? requestedLocale
      : fallbackLocale,
  };
};
