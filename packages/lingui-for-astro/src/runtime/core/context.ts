import type { I18n } from "@lingui/core";

export const LINGUI_ASTRO_CONTEXT = "__lingui_for_astro__";

export interface LinguiContext {
  i18n: I18n;
}

export interface AstroLike {
  locals: object;
}

export function setLinguiContext(
  locals: object,
  instance: I18n,
): LinguiContext {
  const context = { i18n: instance };
  (locals as Record<string, unknown>)[LINGUI_ASTRO_CONTEXT] = context;
  return context;
}

export function getLinguiContext(astro: AstroLike): LinguiContext {
  const context = (astro.locals as Record<string, unknown>)[
    LINGUI_ASTRO_CONTEXT
  ];

  if (!context || typeof context !== "object" || !("i18n" in context)) {
    throw new Error(
      "lingui-for-astro runtime context is missing. Set it in middleware or page setup before rendering translated Astro content.",
    );
  }

  return context as LinguiContext;
}
