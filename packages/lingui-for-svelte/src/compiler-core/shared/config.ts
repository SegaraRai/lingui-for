import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import {
  getParserPlugins as getSharedParserPlugins,
  normalizeLinguiConfig as normalizeSharedLinguiConfig,
} from "@lingui-for/internal-shared-compile";

import { PACKAGE_MACRO, PACKAGE_RUNTIME } from "./constants.ts";
import type { ScriptLang } from "./types.ts";

/**
 * Normalizes a partial Lingui configuration for use by the compiler-core pipeline.
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
): LinguiConfigNormalized {
  return normalizeSharedLinguiConfig(config, {
    macroPackage: PACKAGE_MACRO,
    runtimePackage: PACKAGE_RUNTIME,
  });
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
  return getSharedParserPlugins({ typescript: lang === "ts" });
}
