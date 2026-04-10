import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ParserOptions } from "@babel/core";
import {
  makeConfig,
  type LinguiConfig,
  type LinguiConfigNormalized,
} from "@lingui/conf";
import { cosmiconfig } from "cosmiconfig";
import { createJiti } from "jiti";

const LINGUI_FOR_FRAMEWORK_CONFIG = Symbol.for("lingui-for.framework-config");

const DEFINE_CONFIG_WARNING =
  "[lingui-for] Detected a Lingui config with a `framework` section that was not created with `defineConfig(...)`. Wrap your config export with `defineConfig(...)` from `lingui-for-svelte/config` or `lingui-for-astro/config` so framework-specific settings are applied reliably.";

const LINGUI_MODULE_NAME = "lingui";

// Jiti suggests passing `import.meta.url` directly, but on Windows that can cause a `file:` URL
// to be concatenated with another absolute path downstream. Normalize it to a filesystem path first.
const jitiBasePath = /*#__PURE__*/ fileURLToPath(import.meta.url);

// See https://github.com/lingui/js-lingui/blob/v5.9.5/packages/conf/src/getConfig.ts#L22-L43
const configExplorer = /*#__PURE__*/ cosmiconfig(LINGUI_MODULE_NAME, {
  searchPlaces: [
    `${LINGUI_MODULE_NAME}.config.js`,
    `${LINGUI_MODULE_NAME}.config.cjs`,
    `${LINGUI_MODULE_NAME}.config.ts`,
    `${LINGUI_MODULE_NAME}.config.mjs`,
    "package.json",
    `.${LINGUI_MODULE_NAME}rc`,
    `.${LINGUI_MODULE_NAME}rc.json`,
    `.${LINGUI_MODULE_NAME}rc.yaml`,
    `.${LINGUI_MODULE_NAME}rc.yml`,
    `.${LINGUI_MODULE_NAME}rc.ts`,
    `.${LINGUI_MODULE_NAME}rc.js`,
  ],
  loaders: {
    ".js": /*#__PURE__*/ createJitiLoader(),
    ".ts": /*#__PURE__*/ createJitiLoader(),
    ".mjs": /*#__PURE__*/ createJitiLoader(),
  },
});

let hasWarnedAboutMissingDefineConfig = false;

/**
 * Open registry interface used by lingui-for packages to contribute framework-specific config
 * sections through declaration merging.
 *
 * Importing `lingui-for-svelte/config`, `lingui-for-astro/config`, or both augments this
 * interface so that `framework.svelte` and `framework.astro` become available to `defineConfig`.
 */
export interface LinguiForFrameworkRegistry {}

/**
 * Aggregate map of all framework-specific config sections contributed through
 * {@link LinguiForFrameworkRegistry}.
 *
 * Each property is optional because projects may use only one framework, or may choose not to
 * configure framework-specific behavior at all.
 */
export type LinguiForFrameworkConfig = {
  /**
   * Framework-specific config keyed by the framework name contributed through declaration merging.
   */
  [K in keyof LinguiForFrameworkRegistry]?:
    | LinguiForFrameworkRegistry[K]
    | undefined;
};

type LinguiForFrameworkConfigInput<TFramework extends object = {}> = {
  [K in keyof TFramework]: K extends keyof LinguiForFrameworkRegistry
    ? TFramework[K] & LinguiForFrameworkRegistry[K]
    : never;
};

/**
 * Extended Lingui config object accepted by lingui-for helpers.
 *
 * This type starts from Lingui's normal config shape and adds the optional `framework` section
 * used by lingui-for packages to store Svelte- and Astro-specific settings.
 */
export type LinguiForConfigObject = LinguiConfig & {
  /**
   * Framework-specific settings consumed by lingui-for transforms, extractors, and bundler
   * plugins.
   */
  framework?: LinguiForFrameworkConfig | undefined;
};

/**
 * Input accepted by lingui-for config loaders.
 *
 * Pass a config object directly to avoid discovery, or pass a filesystem path / `URL` to resolve
 * a Lingui config file explicitly. `undefined` means "discover `lingui.config.*` from the chosen
 * project root".
 */
export type LinguiConfigSource =
  /**
   * A fully materialized Lingui config object, optionally including a `framework` section.
   */
  | LinguiForConfigObject
  /**
   * A filesystem path pointing at a Lingui config file.
   */
  | string
  /**
   * A `file:` URL pointing at a Lingui config file.
   */
  | URL
  /**
   * No explicit config source. lingui-for will discover `lingui.config.*` from the configured
   * root directory.
   */
  | undefined;

export interface LoadedLinguiConfig {
  linguiConfig: LinguiConfigNormalized;
  frameworkConfig: LinguiForFrameworkConfig;
}

export type LinguiConfigLoader<TLoadedConfig> = (
  source?: LinguiConfigSource,
  options?: {
    cwd?: string | undefined;
    skipValidation?: boolean | undefined;
  },
) => Promise<TLoadedConfig>;

export interface LinguiConfigResolver<TLoadedConfig> {
  finalizeRoot(root: string): void;
  finalizeResolvedConfigPath(resolvedConfigPath: string): void;
  getConfig(): Promise<TLoadedConfig>;
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

export function defineConfig<
  TConfig extends LinguiConfig,
  TFramework extends object = {},
>(
  config: Omit<TConfig, "framework"> & {
    framework?: LinguiForFrameworkConfig &
      LinguiForFrameworkConfigInput<TFramework>;
  },
): TConfig & {
  framework?: TFramework & LinguiForFrameworkConfig;
};
export function defineConfig<TConfig extends LinguiForConfigObject>(
  config: TConfig,
): TConfig {
  const frameworkConfig = cloneFrameworkConfig(config.framework);
  const { framework: _framework, ...linguiConfig } = config;

  return Object.defineProperty(linguiConfig, LINGUI_FOR_FRAMEWORK_CONFIG, {
    configurable: false,
    enumerable: false,
    value: frameworkConfig,
    writable: false,
  }) as TConfig;
}

export async function loadLinguiConfig(
  source?: LinguiConfigSource,
  options?: {
    cwd?: string | undefined;
    skipValidation?: boolean | undefined;
  },
): Promise<LoadedLinguiConfig | null> {
  const defaultRootDir = options?.cwd ?? process.cwd();

  if (
    source != null &&
    typeof source === "object" &&
    !(source instanceof URL)
  ) {
    warnIfDefineConfigWasNotUsed(source);
    const frameworkConfig = readFrameworkConfig(source);
    return {
      linguiConfig: makeConfig(
        {
          rootDir: source.rootDir ?? defaultRootDir,
          ...stripFrameworkField(source),
        },
        options?.skipValidation != null
          ? { skipValidation: options?.skipValidation }
          : {},
      ),
      frameworkConfig,
    };
  }

  const requestedPath =
    source != null ? normalizeConfigPath(source) : process.env.LINGUI_CONFIG;
  const result = configExists(requestedPath)
    ? await configExplorer.load(requestedPath)
    : await configExplorer.search(defaultRootDir);
  if (!result) {
    return null;
  }

  const userConfig = result.config as LinguiForConfigObject;
  warnIfDefineConfigWasNotUsed(userConfig);
  const frameworkConfig = readFrameworkConfig(userConfig);

  return {
    linguiConfig: makeConfig(
      {
        rootDir: path.dirname(result.filepath),
        ...stripFrameworkField(userConfig),
      },
      {
        resolvedConfigPath: result.filepath,
        ...(options?.skipValidation != null
          ? { skipValidation: options?.skipValidation }
          : {}),
      },
    ),
    frameworkConfig,
  };
}

export function createLinguiConfigResolver<TLoadedConfig>(options: {
  loadConfig: LinguiConfigLoader<TLoadedConfig>;
  config?: LinguiConfigSource;
  cwd?: string | undefined;
  missingConfigMessage: string;
}): LinguiConfigResolver<TLoadedConfig> {
  const explicitConfigPromise =
    options.config != null
      ? options.loadConfig(options.config, {
          cwd: options.cwd ?? process.cwd(),
        })
      : undefined;
  let discoveredConfigPromise: Promise<TLoadedConfig> | undefined;

  return {
    finalizeRoot(root) {
      if (explicitConfigPromise != null || discoveredConfigPromise != null) {
        return;
      }

      discoveredConfigPromise = options.loadConfig(undefined, { cwd: root });
    },
    finalizeResolvedConfigPath(resolvedConfigPath) {
      if (explicitConfigPromise != null || discoveredConfigPromise != null) {
        return;
      }

      discoveredConfigPromise = options.loadConfig(resolvedConfigPath, {
        skipValidation: true,
      });
    },
    getConfig(): Promise<TLoadedConfig> {
      const activeConfigPromise =
        explicitConfigPromise ?? discoveredConfigPromise;
      if (activeConfigPromise == null) {
        throw new Error(options.missingConfigMessage);
      }
      return activeConfigPromise;
    },
  };
}

function createJitiLoader(): (filepath: string) => Promise<unknown> {
  return async (filepath) => {
    const jiti = createJiti(jitiBasePath);
    const module = await jiti.import(filepath);
    return (module as { default?: unknown } | undefined)?.default ?? module;
  };
}

function normalizeConfigPath(configPath: string | URL): string {
  return configPath instanceof URL ? fileURLToPath(configPath) : configPath;
}

function configExists(configPath: string | undefined): configPath is string {
  return configPath != null && existsSync(configPath);
}

function readFrameworkConfig(
  config: LinguiForConfigObject,
): LinguiForFrameworkConfig {
  const symbolValue = (
    config as LinguiForConfigObject & {
      [LINGUI_FOR_FRAMEWORK_CONFIG]?: LinguiForFrameworkConfig;
    }
  )[LINGUI_FOR_FRAMEWORK_CONFIG];

  return cloneFrameworkConfig(symbolValue ?? config.framework);
}

function warnIfDefineConfigWasNotUsed(config: LinguiForConfigObject): void {
  if (
    hasWarnedAboutMissingDefineConfig ||
    hasLinguiForFrameworkMetadata(config) ||
    config.framework == null
  ) {
    return;
  }

  hasWarnedAboutMissingDefineConfig = true;
  console.warn(DEFINE_CONFIG_WARNING);
}

function hasLinguiForFrameworkMetadata(config: LinguiForConfigObject): boolean {
  return LINGUI_FOR_FRAMEWORK_CONFIG in config;
}

function stripFrameworkField(
  config: LinguiForConfigObject,
): Partial<LinguiConfig> {
  const {
    framework: _framework,
    resolvedConfigPath: _resolvedConfigPath,
    ...linguiConfig
  } = config as LinguiForConfigObject & {
    resolvedConfigPath?: string | undefined;
  };
  return linguiConfig;
}

function cloneFrameworkConfig(
  config: LinguiForFrameworkConfig | undefined,
): LinguiForFrameworkConfig {
  return config == null ? {} : { ...config };
}
