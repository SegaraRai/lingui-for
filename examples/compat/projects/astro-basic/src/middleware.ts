import { setupI18n } from "@lingui/core";
import { defineMiddleware } from "astro:middleware";

import { messages as en } from "./i18n/locales/en";
import { setLinguiContext } from "lingui-for-astro";

export const onRequest = defineMiddleware((context, next) => {
  setLinguiContext(
    context.locals,
    setupI18n({
      locale: "en",
      messages: { en },
    }),
  );

  return next();
});
