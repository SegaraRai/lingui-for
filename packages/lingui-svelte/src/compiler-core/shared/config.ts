import type { ParserOptions } from "@babel/core";
import {
  makeConfig,
  type LinguiConfig,
  type LinguiConfigNormalized,
} from "@lingui/conf";

import { MACRO_PACKAGE, RUNTIME_PACKAGE } from "./constants.ts";
import type { ScriptLang } from "./types.ts";

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
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
      ...config,
      macro: {
        corePackage: uniqueStrings([
          MACRO_PACKAGE,
          "@lingui/macro",
          "@lingui/core/macro",
          ...(config?.macro?.corePackage ?? []),
        ]),
        jsxPackage: uniqueStrings([
          MACRO_PACKAGE,
          "@lingui/macro",
          "@lingui/react/macro",
          ...(config?.macro?.jsxPackage ?? []),
        ]),
      },
      runtimeConfigModule: {
        i18n: ["@lingui/core", "i18n"] as const,
        Trans: [RUNTIME_PACKAGE, "RuntimeTrans"] as const,
        ...runtimeConfigModule,
      },
    },
    { skipValidation: true },
  );
}

export function getParserPlugins(
  lang: ScriptLang,
): NonNullable<ParserOptions["plugins"]> {
  return [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
    ...(lang === "ts" ? (["typescript"] as const) : []),
    "jsx",
  ];
}
