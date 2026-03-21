import type { ParserOptions } from "@babel/core";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

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
    i18n: ["@lingui/core", "i18n"] as const,
    Trans: [options.runtimePackage, "RuntimeTrans"] as const,
  };

  if (runtimeConfigModule) {
    Object.assign(mergedRuntimeConfigModule, runtimeConfigModule);
  }

  return {
    ...config,
    macro: {
      corePackage: uniqueStrings([
        options.macroPackage,
        "@lingui/macro",
        "@lingui/core/macro",
        ...(config?.macro?.corePackage ?? []),
      ]),
      jsxPackage: uniqueStrings([
        options.macroPackage,
        "@lingui/macro",
        "@lingui/react/macro",
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
