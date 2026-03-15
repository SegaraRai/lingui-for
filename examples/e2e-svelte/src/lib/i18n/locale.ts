export const LOCALE_COOKIE = "lingui-for-svelte-locale";

export const supportedLocales = ["en", "ja"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export function isSupportedLocale(
  value: string | null | undefined,
): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

export function resolveLocale(
  urlLocale: string | null,
  cookieLocale: string | undefined,
  acceptLanguage: string | null,
): SupportedLocale {
  if (isSupportedLocale(urlLocale)) {
    return urlLocale;
  }

  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  if (
    typeof acceptLanguage === "string" &&
    acceptLanguage.toLowerCase().includes("ja")
  ) {
    return "ja";
  }

  return "en";
}
