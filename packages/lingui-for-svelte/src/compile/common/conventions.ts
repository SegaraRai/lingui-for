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
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_I18N,
  RUNTIME_BINDING_TRANSLATE,
  EAGER_TRANSLATION_WRAPPER,
  REACTIVE_TRANSLATION_WRAPPER,
} from "./constants.ts";

export function createSvelteFrameworkConventions(
  linguiConfig: LinguiConfigNormalized,
  options?: {
    packages?: readonly string[] | undefined;
  },
): FrameworkConventions {
  return {
    framework: "svelte",
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
        ["svelte", createMacroPackage(options?.packages ?? [PACKAGE_MACRO])],
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
      i18nAccessorFactory: EXPORT_CREATE_LINGUI_ACCESSORS,
      context: RUNTIME_BINDING_CONTEXT,
      getI18n: RUNTIME_BINDING_GET_I18N,
      translate: RUNTIME_BINDING_TRANSLATE,
      reactiveTranslationWrapper: REACTIVE_TRANSLATION_WRAPPER,
      eagerTranslationWrapper: EAGER_TRANSLATION_WRAPPER,
      runtimeTransComponent: RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
    },
  };
}

function createMacroPackage(packageNames: readonly string[]): MacroPackage {
  return {
    packages: [...new Set(packageNames)],
  };
}
