import { defineMiddleware } from "astro:middleware";

import { setLinguiContext } from "lingui-for-astro";

import {
  LOCALE_COOKIE,
  isSupportedLocale,
  resolveLocale,
} from "./lib/i18n/locale";
import { createAppI18n } from "./lib/i18n/runtime";

export const onRequest = defineMiddleware(async (context, next) => {
  // Pages under /init/ manage their own Lingui context in frontmatter and must
  // not have it set by middleware, so they can test the same-component init
  // pattern in isolation.
  if (context.url.pathname.startsWith("/init/")) {
    return next();
  }

  const requestedLocale = context.url.searchParams.get("lang");
  const cookieLocale = context.cookies.get(LOCALE_COOKIE)?.value;
  const locale = resolveLocale(
    requestedLocale,
    cookieLocale,
    context.request.headers.get("accept-language"),
  );

  context.locals.locale = locale;
  setLinguiContext(context.locals, createAppI18n(locale));

  if (isSupportedLocale(requestedLocale)) {
    context.cookies.set(LOCALE_COOKIE, requestedLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return next();
});
