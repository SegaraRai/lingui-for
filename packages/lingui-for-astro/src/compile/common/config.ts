import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import type { WhitespaceMode } from "@lingui-for/internal-lingui-analyzer-wasm";
import {
  getParserPlugins as getSharedParserPlugins,
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_RUNTIME_TRANS_EXPORT,
  LINGUI_STANDARD_CORE_MACRO_PACKAGES,
} from "@lingui-for/internal-shared-compile";

import { PACKAGE_MACRO, PACKAGE_RUNTIME } from "./constants.ts";

/**
 * Whitespace normalization mode for rich-text Component Macros in `.astro` files.
 *
 * Use `"auto"` to follow Astro-aware whitespace semantics, or pass an explicit analyzer mode such
 * as `"jsx"` when you need non-default normalization.
 *
 * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#astro
 */
export type RichTextWhitespaceMode = "auto" | WhitespaceMode;

/**
 * Normalizes Lingui config for Astro-specific macro and runtime integration.
 *
 * @param config Partial Lingui config provided by the caller.
 * @returns A normalized config that always includes this package's macro imports and runtime
 * bindings.
 *
 * The returned config extends the caller's macro package lists and points Lingui's
 * `runtimeConfigModule.Trans` binding at `lingui-for-astro/runtime`.
 */
export function normalizeLinguiConfig(
  config?: Partial<LinguiConfig>,
  options?: {
    astroPackages?: readonly string[] | undefined;
  },
): LinguiConfigNormalized {
  const runtimeConfigModule =
    config?.runtimeConfigModule &&
    typeof config.runtimeConfigModule === "object" &&
    !Array.isArray(config.runtimeConfigModule)
      ? Object.assign({}, config.runtimeConfigModule)
      : undefined;

  const mergedRuntimeConfigModule = {
    i18n: [LINGUI_CORE_PACKAGE, LINGUI_I18N_EXPORT] as const,
    Trans: [PACKAGE_RUNTIME, LINGUI_RUNTIME_TRANS_EXPORT] as const,
  };

  if (runtimeConfigModule) {
    Object.assign(mergedRuntimeConfigModule, runtimeConfigModule);
  }

  const astroPackages = uniqueStrings([
    PACKAGE_MACRO,
    ...(options?.astroPackages ?? []),
  ]);
  const corePackages = uniqueStrings([
    PACKAGE_MACRO,
    ...LINGUI_STANDARD_CORE_MACRO_PACKAGES,
    ...(config?.macro?.corePackage ?? []),
  ]);

  return {
    ...config,
    macro: {
      ...config?.macro,
      corePackage: corePackages,
      // We have to override `jsxPackage` here to ensure the macro plugin recognizes `lingui-for-astro/macro` imports in synthetic modules
      jsxPackage: astroPackages,
    },
    runtimeConfigModule: mergedRuntimeConfigModule,
  } as LinguiConfigNormalized;
}

/**
 * Returns the Babel parser plugins required by Astro transforms.
 *
 * @returns The parser plugin list used for Lingui-related Babel parsing in this package.
 */
export function getParserPlugins(): NonNullable<ParserOptions["plugins"]> {
  return getSharedParserPlugins({ typescript: true });
}

export function resolveAstroWhitespace(
  whitespace: RichTextWhitespaceMode,
): WhitespaceMode {
  return whitespace === "auto" ? "astro" : whitespace;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
