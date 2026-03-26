import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import {
  LINGUI_CORE_PACKAGE,
  LINGUI_CORE_MACRO_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_MACRO_PACKAGE,
  LINGUI_REACT_MACRO_PACKAGE,
  LINGUI_RUNTIME_TRANS_EXPORT,
} from "./lingui-constants.ts";

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function normalizeLinguiConfig(
  config: Partial<LinguiConfig> | undefined,
  options: {
    readonly macroPackage: string;
    readonly runtimePackage: string;
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
    Trans: [options.runtimePackage, LINGUI_RUNTIME_TRANS_EXPORT] as const,
  };

  if (runtimeConfigModule) {
    Object.assign(mergedRuntimeConfigModule, runtimeConfigModule);
  }

  return {
    ...config,
    macro: {
      corePackage: uniqueStrings([
        options.macroPackage,
        LINGUI_MACRO_PACKAGE,
        LINGUI_CORE_MACRO_PACKAGE,
        ...(config?.macro?.corePackage ?? []),
      ]),
      jsxPackage: uniqueStrings([
        options.macroPackage,
        LINGUI_MACRO_PACKAGE,
        LINGUI_REACT_MACRO_PACKAGE,
        ...(config?.macro?.jsxPackage ?? []),
      ]),
    },
    runtimeConfigModule: mergedRuntimeConfigModule,
  } as LinguiConfigNormalized;
}

export function getParserPlugins(options?: {
  readonly typescript?: boolean;
}): NonNullable<ParserOptions["plugins"]> {
  return [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
    ...(options?.typescript ? (["typescript"] as const) : []),
    "jsx",
  ];
}
