import type { LinguiConfigNormalized } from "@lingui/conf";

import type { FrameworkConventions } from "@lingui-for/internal-lingui-analyzer-wasm";

import {
  EXPORT_CREATE_FRONTMATTER_I18N,
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  RUNTIME_BINDING_CREATE_I18N,
  RUNTIME_BINDING_I18N,
} from "./constants.ts";

export function createAstroFrameworkConventions(
  linguiConfig: LinguiConfigNormalized,
  options?: {
    astroPackages?: readonly string[] | undefined;
  },
): FrameworkConventions {
  return {
    framework: "astro",
    macro: {
      primaryPackage: PACKAGE_MACRO,
      acceptedPackages: getAcceptedMacroPackages(linguiConfig, options),
    },
    runtime: {
      package: PACKAGE_RUNTIME,
      exports: {
        trans: "RuntimeTrans",
        i18nAccessor: EXPORT_CREATE_FRONTMATTER_I18N,
      },
    },
    bindings: {
      i18nAccessorFactory: RUNTIME_BINDING_CREATE_I18N,
      i18nInstance: RUNTIME_BINDING_I18N,
      runtimeTransComponent: RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
    },
  };
}

function getAcceptedMacroPackages(
  linguiConfig: LinguiConfigNormalized,
  options?: {
    astroPackages?: readonly string[] | undefined;
  },
): string[] {
  return [
    ...new Set([
      ...(linguiConfig.macro?.corePackage ?? []),
      PACKAGE_MACRO,
      ...(options?.astroPackages ?? []),
    ]),
  ];
}
