import type { I18n } from "@lingui/core";

/**
 * Internal key used to store the Lingui runtime context on `Astro.locals`.
 *
 * Applications normally interact with this indirectly through
 * {@link setLinguiContext} and {@link getLinguiContext}.
 */
export const LINGUI_ASTRO_CONTEXT = "__lingui_for_astro__";

/**
 * Runtime context shared between translated Astro content.
 *
 * This is primarily a compiler/runtime contract. Most applications should use macros rather than
 * interacting with runtime translation helpers directly.
 */
export interface LinguiContext {
  /**
   * Active Lingui instance for the current request.
   */
  i18n: I18n;
}

/**
 * Stores the active Lingui context on the current Astro request.
 *
 * @param locals `Astro.locals` object for the current request.
 * @param instance Lingui instance that should back translations for this request.
 * @returns The created runtime context object.
 *
 * Call this from middleware or page setup before rendering translated Astro content.
 */
export function setLinguiContext(
  locals: object,
  instance: I18n,
): LinguiContext {
  const context = { i18n: instance };
  (locals as Record<string, unknown>)[LINGUI_ASTRO_CONTEXT] = context;
  return context;
}

/**
 * Reads the Lingui runtime context from `Astro.locals`.
 *
 * @param locals `Astro.locals` object for the current request.
 * @returns The active Lingui runtime context for the current request.
 *
 * This is part of the runtime plumbing used by compiled Astro output. Applications typically call
 * it only when bridging context into nested renderers.
 */
export function getLinguiContext(locals: object): LinguiContext {
  const context = (locals as Record<string, unknown>)[LINGUI_ASTRO_CONTEXT];

  if (!context || typeof context !== "object" || !("i18n" in context)) {
    throw new Error(
      "lingui-for-astro runtime context is missing. Set it in middleware or page setup before rendering translated Astro content.",
    );
  }

  return context as LinguiContext;
}

type Translate = I18n["_"];

/**
 * Creates a lazy i18n accessor for use in Astro frontmatter.
 *
 * @param locals `Astro.locals` object for the current request.
 * @returns An object with a single `_` property that proxies to the active Lingui instance's
 * translation function.
 *
 * This is used by the compiler to support translations in frontmatter. It defers reading the
 * Lingui context until the first call to `_`, allowing it to work when the context is set in
 * the same frontmatter block.
 */
export function createFrontmatterI18n(locals: object): Pick<I18n, "_"> {
  const translate = ((...args: Parameters<Translate>) =>
    getLinguiContext(locals).i18n._(...args)) as Translate;
  return { _: translate };
}
