import type { Handle } from "@sveltejs/kit";

import {
  LOCALE_COOKIE,
  isSupportedLocale,
  resolveLocale,
} from "$lib/i18n/locale";

export const handle: Handle = async ({ event, resolve }) => {
  const requestedLocale = event.url.searchParams.get("lang");
  const cookieLocale = event.cookies.get(LOCALE_COOKIE);

  event.locals.locale = resolveLocale(
    requestedLocale,
    cookieLocale,
    event.request.headers.get("accept-language"),
  );

  if (isSupportedLocale(requestedLocale)) {
    event.cookies.set(LOCALE_COOKIE, requestedLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace(
        /<html lang="[^"]*">/,
        `<html lang="${event.locals.locale}">`,
      ),
  });
};
