import type { ParserOptions } from "@babel/core";
import {
  makeConfig,
  type LinguiConfig,
  type LinguiConfigNormalized,
} from "@lingui/conf";

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

export function normalizeJavaScriptLinguiConfig(
  config?: Partial<LinguiConfig>,
): LinguiConfigNormalized {
  return makeConfig(createBaseLinguiConfig(config), {
    skipValidation: true,
  });
}

export function normalizeLinguiConfig(
  config?: Partial<LinguiConfig>,
): LinguiConfigNormalized {
  const runtimeConfigModule =
    config?.runtimeConfigModule &&
    typeof config.runtimeConfigModule === "object" &&
    !Array.isArray(config.runtimeConfigModule)
      ? config.runtimeConfigModule
      : {};

  return makeConfig(
    {
      ...createBaseLinguiConfig(config),
      runtimeConfigModule: {
        i18n: ["@lingui/core", "i18n"] as const,
        Trans: [PACKAGE_RUNTIME, "RuntimeTrans"] as const,
        ...runtimeConfigModule,
      },
    },
    { skipValidation: true },
  );
}

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
