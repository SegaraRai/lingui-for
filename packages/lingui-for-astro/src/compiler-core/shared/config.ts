import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import { PACKAGE_MACRO, PACKAGE_RUNTIME } from "./constants.ts";

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function createBaseLinguiConfig(
  config?: Partial<LinguiConfig>,
): Partial<LinguiConfig> {
  return {
    ...config,
    macro: {
      corePackage: uniqueStrings([
        PACKAGE_MACRO,
        "@lingui/macro",
        "@lingui/core/macro",
        ...(config?.macro?.corePackage ?? []),
      ]),
      jsxPackage: uniqueStrings([
        PACKAGE_MACRO,
        "@lingui/macro",
        "@lingui/react/macro",
        ...(config?.macro?.jsxPackage ?? []),
      ]),
    },
  };
}

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
  const runtimeConfigModule =
    config?.runtimeConfigModule &&
    typeof config.runtimeConfigModule === "object" &&
    !Array.isArray(config.runtimeConfigModule)
      ? config.runtimeConfigModule
      : {};

  return {
    ...createBaseLinguiConfig(config),
    runtimeConfigModule: {
      i18n: ["@lingui/core", "i18n"] as const,
      Trans: [PACKAGE_RUNTIME, "RuntimeTrans"] as const,
      ...runtimeConfigModule,
    },
  } as LinguiConfigNormalized;
}

/**
 * Returns the Babel parser plugins required by Astro and MDX transforms.
 *
 * @returns The parser plugin list used for Lingui-related Babel parsing in this package.
 */
export function getParserPlugins(): NonNullable<ParserOptions["plugins"]> {
  return [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
    "typescript",
    "jsx",
  ];
}
