import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import type {
  ScriptLang,
  WhitespaceMode,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import {
  getParserPlugins as getSharedParserPlugins,
  LINGUI_CORE_MACRO_PACKAGE,
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_RUNTIME_TRANS_EXPORT,
} from "@lingui-for/internal-shared-compile";

import { PACKAGE_MACRO, PACKAGE_RUNTIME } from "./constants.ts";

export type RichTextWhitespaceMode = "auto" | WhitespaceMode;

/**
 * Normalizes a partial Lingui configuration for use by the compile pipeline.
 *
 * @param config Optional user-provided Lingui configuration overrides.
 * @returns A fully normalized Lingui configuration with Lingui-for-Svelte defaults merged in.
 *
 * This helper ensures the Lingui macro plugin recognizes both the standard Lingui macro packages
 * and `lingui-for-svelte/macro`. It also wires Lingui's runtime config so transformed component
 * macros lower to `RuntimeTrans` while plain JS/TS macros continue to use `@lingui/core`.
 */
export function normalizeLinguiConfig(
  config?: Partial<LinguiConfig>,
  options?: {
    sveltePackages?: readonly string[] | undefined;
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

  const sveltePackages = uniqueStrings([
    PACKAGE_MACRO,
    ...(options?.sveltePackages ?? []),
  ]);

  return {
    ...config,
    macro: {
      ...config?.macro,
      corePackage: uniqueStrings([
        PACKAGE_MACRO,
        LINGUI_CORE_MACRO_PACKAGE,
        ...(config?.macro?.corePackage ?? []),
      ]),
      // We have to override `jsxPackage` here to ensure the macro plugin recognizes `lingui-for-svelte/macro` imports in synthetic modules
      jsxPackage: sveltePackages,
    },
    runtimeConfigModule: mergedRuntimeConfigModule,
  } as LinguiConfigNormalized;
}

/**
 * Returns the Babel parser plugin list required for a given script language.
 *
 * @param lang Script language mode inferred from the source file.
 * @returns The parser plugins that should be passed to Babel for this source.
 *
 * The returned list is shared across analysis helpers and transform stages so macro detection,
 * identifier allocation, and the main Lingui transform all parse code with the same feature set.
 */
export function getParserPlugins(
  lang: ScriptLang,
): NonNullable<ParserOptions["plugins"]> {
  return getSharedParserPlugins({
    typescript: lang === "ts" || lang === "tsx",
  });
}

export function resolveSvelteWhitespace(
  whitespace: RichTextWhitespaceMode,
): WhitespaceMode {
  return whitespace === "auto" ? "svelte" : whitespace;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
