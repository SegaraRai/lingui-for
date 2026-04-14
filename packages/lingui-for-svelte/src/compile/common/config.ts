import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";

import {
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_STANDARD_CORE_MACRO_PACKAGES,
  type RuntimeWarningOptions,
  type ScriptLang,
  type SvelteWhitespaceMode,
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
 * Framework-specific config accepted under `framework.svelte`.
 *
 * These settings control Svelte-only compile behavior while keeping the Lingui config file as the
 * single source of truth for both generic Lingui options and framework extensions.
 */
export interface LinguiSvelteFrameworkConfig {
  /**
   * Macro package names that should be treated like `lingui-for-svelte/macro`.
   *
   * Use this when you wrap or re-export the Svelte macro entrypoint under a custom package name.
   * When set, this replaces the default `lingui-for-svelte/macro` package name.
   *
   * @default ["lingui-for-svelte/macro"]
   */
  packages?: readonly string[] | undefined;
  /**
   * Whitespace normalization mode for rich-text component macros in `.svelte` files.
   *
   * `"svelte"` selects Svelte-aware behavior. Use `"jsx"` for JSX-compatible normalization.
   *
   * @default "svelte"
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#svelte
   */
  whitespace?: SvelteWhitespaceMode | undefined;
  /**
   * Runtime warning switches emitted by generated Svelte runtime helpers.
   *
   * This is primarily used to control diagnostics such as `Trans` content override warnings.
   * By default, these warnings are enabled in development and disabled in production.
   */
  runtimeWarnings?: RuntimeWarningOptions | undefined;
}

/**
 * Normalizes a partial Lingui configuration for use by the compile pipeline.
 *
 * @param config Optional user-provided Lingui configuration overrides.
 * @returns A fully normalized Lingui configuration with Lingui-for-Svelte defaults merged in.
 *
 * This helper ensures the Lingui macro plugin recognizes both the standard Lingui macro packages
 * and `lingui-for-svelte/macro`. It also wires Lingui's runtime config so transformed component
 * macros lower to `RuntimeTrans` while plain JS/TS macros continue to use `@lingui/core`.
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

  const sveltePackages = uniqueStrings(options?.packages ?? [PACKAGE_MACRO]);
  const corePackages = uniqueStrings([
    ...sveltePackages,
    ...(config?.macro?.corePackage ?? LINGUI_STANDARD_CORE_MACRO_PACKAGES),
  ]);

  return {
    ...config,
    macro: {
      ...config?.macro,
      corePackage: corePackages,
      // We have to override `jsxPackage` here to ensure the macro plugin recognizes `lingui-for-svelte/macro` imports in synthetic modules
      jsxPackage: sveltePackages,
    },
    runtimeConfigModule: mergedRuntimeConfigModule,
  } as LinguiConfigNormalized;
}

/**
 * Returns the Babel parser plugin list required for a given script language.
 *
 * @param lang Script language mode inferred from the source file.
 * @returns The parser plugins that should be passed to Babel for this source.
 *
 * The returned list is shared across analysis helpers and transform stages so macro detection,
 * identifier allocation, and the main Lingui transform all parse code with the same feature set.
 */
export function getParserPlugins(
  lang: ScriptLang,
): NonNullable<ParserOptions["plugins"]> {
  return getParserPluginsShared({
    typescript: lang === "ts",
  });
}

export async function loadLinguiConfig(
  source?: LinguiConfigSource,
  options?: {
    cwd?: string | undefined;
    skipValidation?: boolean | undefined;
  },
): Promise<{
  linguiConfig: LinguiConfigNormalized;
  frameworkConfig: LinguiSvelteFrameworkConfig;
}> {
  const loaded = await loadLinguiConfigShared(source, options);
  if (loaded == null) {
    throw new Error(
      "lingui-for-svelte requires a Lingui config file or explicit config object.",
    );
  }
  const frameworkConfig = (
    loaded.frameworkConfig as {
      svelte?: LinguiSvelteFrameworkConfig | undefined;
    }
  ).svelte;

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
