import type { LinguiConfigNormalized } from "@lingui/conf";

import type {
  FrameworkConventions,
  MacroPackage,
  MacroPackageKind,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { LINGUI_STANDARD_CORE_MACRO_PACKAGES } from "@lingui-for/internal-shared-compile";

import {
  EXPORT_CREATE_LINGUI_ACCESSORS,
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  RUNTIME_BINDING_CREATE_I18N,
  RUNTIME_BINDING_I18N,
} from "./constants.ts";

export function createAstroFrameworkConventions(
  linguiConfig: LinguiConfigNormalized,
  options?: {
    packages?: readonly string[] | undefined;
  },
): FrameworkConventions {
  return {
    framework: "astro",
    macro: {
      packages: new Map<MacroPackageKind, MacroPackage>([
        [
          "core",
          createMacroPackage(
            linguiConfig.macro?.corePackage ?? [
              ...LINGUI_STANDARD_CORE_MACRO_PACKAGES,
            ],
          ),
        ],
        ["astro", createMacroPackage(options?.packages ?? [PACKAGE_MACRO])],
      ]),
    },
    runtime: {
      package: PACKAGE_RUNTIME,
      exports: {
        trans: "RuntimeTrans",
        i18nAccessor: EXPORT_CREATE_LINGUI_ACCESSORS,
      },
    },
    bindings: {
      i18nAccessorFactory: RUNTIME_BINDING_CREATE_I18N,
      i18nInstance: RUNTIME_BINDING_I18N,
      reactiveTranslationWrapper: undefined,
      eagerTranslationWrapper: undefined,
      runtimeTransComponent: RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
    },
  };
}

function createMacroPackage(packageNames: readonly string[]): MacroPackage {
  return {
    packages: [...new Set(packageNames)],
  };
}
