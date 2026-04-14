import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import {
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
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

import {
  EXPORT_RUNTIME_TRANS,
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
} from "./constants.ts";

/**
 * Whitespace normalization mode for rich-text component macros in `.astro` files.
 *
 * Use `"astro"` for Astro-aware whitespace semantics, or `"jsx"` when you need JSX-compatible
 * normalization.
 *
 * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#astro
 */
export type RichTextWhitespaceMode = AstroWhitespaceMode;

/**
 * Framework-specific config accepted under `framework.astro`.
 *
 * These settings control Astro-only compile behavior while keeping the Lingui config file as the
 * single source of truth for both generic Lingui options and framework extensions.
 */
export interface LinguiAstroFrameworkConfig {
  /**
   * Macro package names that should be treated like `lingui-for-astro/macro`.
   *
   * Use this when you wrap or re-export the Astro macro entrypoint under a custom package name.
   * When set, this replaces the default `lingui-for-astro/macro` package name.
   *
   * @default ["lingui-for-astro/macro"]
   */
  packages?: readonly string[] | undefined;
  /**
   * Whitespace normalization mode for rich-text component macros in `.astro` files.
   *
   * `"astro"` selects Astro-aware behavior. Use `"jsx"` for JSX-compatible normalization.
   *
   * @default "astro"
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#astro
   */
  whitespace?: AstroWhitespaceMode | undefined;
  /**
   * Runtime warning switches emitted by generated Astro runtime helpers.
   *
   * This is primarily used to control diagnostics such as `Trans` content override warnings.
   * By default, these warnings are enabled in development and disabled in production.
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
    Trans: [PACKAGE_RUNTIME, EXPORT_RUNTIME_TRANS] as const,
  };

  if (runtimeConfigModule) {
    Object.assign(mergedRuntimeConfigModule, runtimeConfigModule);
  }

  const astroPackages = uniqueStrings(options?.packages ?? [PACKAGE_MACRO]);
  const corePackages = uniqueStrings([
    ...astroPackages,
    ...(config?.macro?.corePackage ?? LINGUI_STANDARD_CORE_MACRO_PACKAGES),
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
