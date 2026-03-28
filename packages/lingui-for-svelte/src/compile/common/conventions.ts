import type { LinguiConfigNormalized } from "@lingui/conf";

import type { FrameworkConventions } from "@lingui-for/internal-lingui-analyzer-wasm";

import {
  EAGER_TRANSLATION_WRAPPER,
  EXPORT_CREATE_LINGUI_ACCESSORS,
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  REACTIVE_TRANSLATION_WRAPPER,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_I18N,
  RUNTIME_BINDING_TRANSLATE,
  SYNTHETIC_PREFIX_COMPONENT,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "./constants.ts";

export function createSvelteFrameworkConventions(
  linguiConfig: LinguiConfigNormalized,
  options?: {
    sveltePackages?: readonly string[] | undefined;
  },
): FrameworkConventions {
  return {
    framework: "svelte",
    macro: {
      primaryPackage: PACKAGE_MACRO,
      acceptedPackages: getAcceptedMacroPackages(linguiConfig, options),
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
      runtimeTransComponent: RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
    },
    synthetic: {
      expressionPrefix: SYNTHETIC_PREFIX_EXPRESSION,
      componentPrefix: SYNTHETIC_PREFIX_COMPONENT,
    },
    wrappers: {
      reactiveTranslation: REACTIVE_TRANSLATION_WRAPPER,
      eagerTranslation: EAGER_TRANSLATION_WRAPPER,
    },
  };
}

function getAcceptedMacroPackages(
  linguiConfig: LinguiConfigNormalized,
  options?: {
    sveltePackages?: readonly string[] | undefined;
  },
): string[] {
  return [
    ...new Set([
      ...(linguiConfig.macro?.corePackage ?? []),
      PACKAGE_MACRO,
      ...(options?.sveltePackages ?? []),
    ]),
  ];
}
