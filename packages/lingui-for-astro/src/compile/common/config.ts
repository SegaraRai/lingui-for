import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import {
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_RUNTIME_TRANS_EXPORT,
  LINGUI_STANDARD_CORE_MACRO_PACKAGES,
  type AstroWhitespaceMode,
  type RuntimeWarningOptions,
} from "@lingui-for/framework-core/compile";
import {
  getParserPlugins as getParserPluginsShared,
  loadLinguiConfig as loadLinguiConfigShared,
  type LinguiConfigSource,
} from "@lingui-for/framework-core/config";
import type { ParserOptions } from "@lingui-for/framework-core/vendor/babel-core";

import { PACKAGE_MACRO, PACKAGE_RUNTIME } from "./constants.ts";

/**
 * Whitespace normalization mode for rich-text Component Macros in `.astro` files.
 *
 * Use `"astro"` for Astro-aware whitespace semantics, or `"jsx"` when you need JSX-compatible
 * normalization.
 *
 * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#astro
 */
export type RichTextWhitespaceMode = AstroWhitespaceMode;

/**
 * Astro-specific framework config extracted from the shared `framework` section.
 *
 * This is the normalized internal view used by Astro transforms, extractors, and bundler plugins.
 */
export interface LinguiAstroFrameworkConfig {
  /**
   * Additional macro package names that should be recognized as Astro macro entrypoints.
   */
  packages?: readonly string[] | undefined;
  /**
   * Whitespace normalization mode for rich-text component macros in `.astro` files.
   */
  whitespace?: RichTextWhitespaceMode | undefined;
  /**
   * Runtime warning switches emitted by generated Astro runtime helpers.
   */
  runtimeWarnings?: RuntimeWarningOptions | undefined;
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
  options?: {
    packages?: readonly string[] | undefined;
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
    Trans: [PACKAGE_RUNTIME, LINGUI_RUNTIME_TRANS_EXPORT] as const,
  };

  if (runtimeConfigModule) {
    Object.assign(mergedRuntimeConfigModule, runtimeConfigModule);
  }

  const astroPackages = uniqueStrings([
    PACKAGE_MACRO,
    ...(options?.packages ?? []),
  ]);
  const corePackages = uniqueStrings([
    PACKAGE_MACRO,
    ...LINGUI_STANDARD_CORE_MACRO_PACKAGES,
    ...(config?.macro?.corePackage ?? []),
  ]);

  return {
    ...config,
    macro: {
      ...config?.macro,
      corePackage: corePackages,
      // We have to override `jsxPackage` here to ensure the macro plugin recognizes `lingui-for-astro/macro` imports in synthetic modules
      jsxPackage: astroPackages,
    },
    runtimeConfigModule: mergedRuntimeConfigModule,
  } as LinguiConfigNormalized;
}

/**
 * Returns the Babel parser plugins required by Astro transforms.
 *
 * @returns The parser plugin list used for Lingui-related Babel parsing in this package.
 */
export function getParserPlugins(): NonNullable<ParserOptions["plugins"]> {
  return getParserPluginsShared({ typescript: true });
}

export function resolveAstroWhitespace(
  whitespace: RichTextWhitespaceMode,
): AstroWhitespaceMode {
  return whitespace;
}

export async function loadLinguiConfig(
  source?: LinguiConfigSource,
  options?: {
    cwd?: string | undefined;
    skipValidation?: boolean | undefined;
  },
): Promise<{
  linguiConfig: LinguiConfigNormalized;
  frameworkConfig: LinguiAstroFrameworkConfig;
}> {
  const loaded = await loadLinguiConfigShared(source, options);
  if (loaded == null) {
    throw new Error(
      "lingui-for-astro requires a Lingui config file or explicit config object.",
    );
  }
  const frameworkConfig = (
    loaded.frameworkConfig as {
      astro?: LinguiAstroFrameworkConfig | undefined;
    }
  ).astro;

  return {
    linguiConfig: normalizeLinguiConfig(loaded.linguiConfig, {
      packages: frameworkConfig?.packages,
    }),
    frameworkConfig: frameworkConfig ?? {},
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
