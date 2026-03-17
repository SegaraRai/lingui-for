import { AsyncLocalStorage } from "node:async_hooks";
import type { I18n } from "@lingui/core";

/**
 * Internal key used to store the Lingui runtime context on `Astro.locals`.
 *
 * Applications normally interact with this indirectly through
 * {@link setLinguiContext} and {@link getLinguiContext}.
 */
export const LINGUI_ASTRO_CONTEXT = "__lingui_for_astro__";

/**
 * Runtime context shared between translated Astro content and MDX renderers.
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
 * Minimal Astro-like object accepted by {@link getLinguiContext}.
 */
export interface AstroLike {
  /**
   * Request-scoped locals bag that may contain the Lingui context.
   */
  locals: object;
}

/**
 * Minimal MDX props shape accepted by {@link getMdxLinguiContext}.
 */
export interface MdxPropsLike {
  /**
   * Internal Lingui context prop forwarded from the surrounding `.astro` page.
   */
  __lingui?: LinguiContext;
}

const linguiContextStorage = new AsyncLocalStorage<LinguiContext>();

/**
 * Stores the active Lingui context on the current Astro request.
 *
 * @param locals `Astro.locals` object for the current request.
 * @param instance Lingui instance that should back translations for this request.
 * @returns The created runtime context object.
 *
 * Call this from middleware or page setup before rendering translated Astro or MDX content.
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
 * Runs work inside a request-scoped Lingui runtime context.
 *
 * @param context Runtime context to expose for the duration of the callback.
 * @param callback Work to execute with the provided context in scope.
 * @returns The callback result.
 *
 * This is primarily useful in Node-based Astro environments so translated MDX content can resolve
 * the current Lingui instance even when props forwarding is not available. Applications should
 * still prefer the explicit `__lingui` prop bridge for MDX when they control the render call site.
 */
export function runWithLinguiContext<T>(
  context: LinguiContext,
  callback: () => T,
): T {
  return linguiContextStorage.run(context, callback);
}

/**
 * Reads the Lingui runtime context from `Astro.locals`.
 *
 * @param astro Astro-like object exposing the request `locals`.
 * @returns The active Lingui runtime context for the current request.
 *
 * This is part of the runtime plumbing used by compiled Astro output. Applications typically call
 * it only when bridging context into nested renderers such as MDX.
 */
export function getLinguiContext(astro: AstroLike): LinguiContext {
  const context = (astro.locals as Record<string, unknown>)[
    LINGUI_ASTRO_CONTEXT
  ];

  if (context && typeof context === "object" && "i18n" in context) {
    return context as LinguiContext;
  }

  const fallbackContext = linguiContextStorage.getStore();
  if (fallbackContext) {
    return fallbackContext;
  }

  throw new Error(
    "lingui-for-astro runtime context is missing. Set it in middleware or page setup before rendering translated Astro content.",
  );
}

/**
 * Reads the Lingui runtime context from translated MDX component props.
 *
 * @param props MDX props object that should contain the forwarded Lingui context.
 * @returns The active Lingui runtime context for the current request.
 *
 * This exists so compiled MDX output can resolve the request-scoped Lingui instance even though
 * MDX components do not have direct access to `Astro.locals`.
 */
export function getMdxLinguiContext(props: MdxPropsLike): LinguiContext {
  const context = props.__lingui;

  if (context && typeof context === "object" && "i18n" in context) {
    return context;
  }

  const fallbackContext = linguiContextStorage.getStore();
  if (fallbackContext) {
    return fallbackContext;
  }

  throw new Error(
    "lingui-for-astro MDX runtime context is missing. Pass __lingui={getLinguiContext(Astro)} when rendering translated MDX content, or run rendering inside runWithLinguiContext(...) in Node-based environments.",
  );
}
