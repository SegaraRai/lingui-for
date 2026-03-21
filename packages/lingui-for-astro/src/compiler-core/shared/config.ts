import {
  getParserPlugins as getSharedParserPlugins,
  normalizeLinguiConfig as normalizeSharedLinguiConfig,
} from "lingui-for-shared/compiler";
import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import { PACKAGE_MACRO, PACKAGE_RUNTIME } from "./constants.ts";

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
): LinguiConfigNormalized {
  return normalizeSharedLinguiConfig(config, {
    macroPackage: PACKAGE_MACRO,
    runtimePackage: PACKAGE_RUNTIME,
  });
}

/**
 * Returns the Babel parser plugins required by Astro transforms.
 *
 * @returns The parser plugin list used for Lingui-related Babel parsing in this package.
 */
export function getParserPlugins(): NonNullable<ParserOptions["plugins"]> {
  return getSharedParserPlugins({ typescript: true });
}
