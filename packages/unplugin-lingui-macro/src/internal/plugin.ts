import { fileURLToPath } from "node:url";

import { transformAsync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { getConfig, type LinguiConfig } from "@lingui/conf";
import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import {
  createLinguiMacroPluginOptions,
  stripQuery,
} from "@lingui-for/internal-shared-common";

import type { LinguiMacroPluginOptions } from "../types.ts";
import { hasImport } from "./imports.ts";

type RuntimeConfigModule = LinguiConfig["runtimeConfigModule"];

type RuntimeConfigRecord = Partial<
  Record<"useLingui" | "Trans" | "i18n", readonly [string, string?]>
>;

type LoadedLinguiMacroConfig = {
  extractorParserOptions?: LinguiConfig["extractorParserOptions"] | undefined;
  macro?:
    | {
        corePackage?: readonly string[] | undefined;
        jsxPackage?: readonly string[] | undefined;
      }
    | undefined;
  runtimeConfigModule: {
    i18n: readonly [string, string];
    useLingui: readonly [string, string];
    Trans: readonly [string, string];
  };
};

type BabelParserPlugin =
  | "importAttributes"
  | "jsx"
  | "typescript"
  | "decorators-legacy"
  | ["flow", { all: boolean }];

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeRuntimeConfigModule(
  runtimeConfigModule: RuntimeConfigModule,
): {
  i18n: [string, string];
  useLingui: [string, string];
  Trans: [string, string];
} {
  if (Array.isArray(runtimeConfigModule)) {
    return {
      i18n: [runtimeConfigModule[0], runtimeConfigModule[1] ?? "i18n"],
      useLingui: ["@lingui/react", "useLingui"],
      Trans: ["@lingui/react", "Trans"],
    };
  }

  const runtimeConfig = runtimeConfigModule
    ? (runtimeConfigModule as RuntimeConfigRecord)
    : ({} satisfies RuntimeConfigRecord);

  return {
    i18n: runtimeConfig.i18n
      ? [runtimeConfig.i18n[0], runtimeConfig.i18n[1] ?? "i18n"]
      : ["@lingui/core", "i18n"],
    useLingui: runtimeConfig.useLingui
      ? [runtimeConfig.useLingui[0], runtimeConfig.useLingui[1] ?? "useLingui"]
      : ["@lingui/react", "useLingui"],
    Trans: runtimeConfig.Trans
      ? [runtimeConfig.Trans[0], runtimeConfig.Trans[1] ?? "Trans"]
      : ["@lingui/react", "Trans"],
  };
}

function createFallbackLinguiConfig(): {
  extractorParserOptions?: LinguiConfig["extractorParserOptions"];
  macro: {
    corePackage: string[];
    jsxPackage: string[];
  };
  runtimeConfigModule: {
    i18n: [string, string];
    useLingui: [string, string];
    Trans: [string, string];
  };
} {
  return {
    runtimeConfigModule: normalizeRuntimeConfigModule(undefined),
    macro: {
      corePackage: uniqueStrings(["@lingui/macro", "@lingui/core/macro"]),
      jsxPackage: uniqueStrings(["@lingui/macro", "@lingui/react/macro"]),
    },
  };
}

function getMacroPackages(config: LoadedLinguiMacroConfig): string[] {
  return uniqueStrings([
    ...(config.macro?.corePackage ?? []),
    ...(config.macro?.jsxPackage ?? []),
  ]);
}

function getParserPlugins(
  filename: string,
  config: LoadedLinguiMacroConfig,
): BabelParserPlugin[] {
  const plugins: BabelParserPlugin[] = ["importAttributes"];

  if (/\.[cm]?tsx?$/.test(filename)) {
    plugins.push("typescript");
  }

  if (/\.[cm]?[jt]sx$/.test(filename)) {
    plugins.push("jsx");
  }

  if (
    !plugins.includes("typescript") &&
    config.extractorParserOptions?.flow &&
    /\.(?:[cm]?jsx?|astro\.ts|svelte\.js)$/.test(filename)
  ) {
    plugins.push(["flow", { all: true }]);
  }

  if (config.extractorParserOptions?.tsExperimentalDecorators) {
    plugins.push("decorators-legacy");
  }

  return plugins;
}

export const unpluginFactory: UnpluginFactory<
  LinguiMacroPluginOptions | undefined
> = (options) => {
  const loadedConfig =
    options?.config != null
      ? loadLinguiConfig(options.config, process.cwd())
      : undefined;
  let discoveredConfig: ReturnType<typeof loadLinguiConfig> | undefined;

  function finalizeConfig(root: string): void {
    if (loadedConfig != null || discoveredConfig != null) {
      return;
    }

    discoveredConfig = loadLinguiConfig(undefined, root);
  }

  return {
    name: "unplugin-lingui-macro",
    enforce: "pre",
    async transform(code, id) {
      if (id.startsWith("\0")) {
        return null;
      }

      const filename = stripQuery(id);
      if (
        filename.includes("/node_modules/") ||
        filename.includes("\\node_modules\\") ||
        !/\.[cm]?[jt]sx?$/.test(filename)
      ) {
        return null;
      }

      const activeConfig = loadedConfig ?? discoveredConfig;
      if (activeConfig == null) {
        throw new Error(
          "unplugin-lingui-macro could not resolve a Lingui config. Pass `config` explicitly, or run the plugin from a project root that contains `lingui.config.*`.",
        );
      }
      const linguiConfig = activeConfig.linguiConfig;

      if (!hasImport(code, filename, getMacroPackages(linguiConfig))) {
        return null;
      }

      const transformed = await transformAsync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: {
          sourceType: "module",
          plugins: getParserPlugins(filename, linguiConfig),
        },
        plugins: [
          [
            linguiMacroPlugin,
            createLinguiMacroPluginOptions({
              extract: false,
              linguiConfig,
              pluginEntryUrl: import.meta
                .resolve("@lingui/babel-plugin-lingui-macro"),
            }),
          ],
        ],
      });

      if (!transformed?.code) {
        return null;
      }

      return {
        code: transformed.code,
        map: transformed.map ?? null,
      };
    },
    vite: {
      enforce: "pre",
      configResolved(config) {
        finalizeConfig(config.root);
      },
    },
    webpack(compiler) {
      finalizeConfig(compiler.context);
    },
    buildStart() {
      finalizeConfig(process.cwd());
    },
  };
};

function loadLinguiConfig(
  source: LinguiMacroPluginOptions["config"],
  root: string,
): {
  linguiConfig: LoadedLinguiMacroConfig;
} {
  if (
    source != null &&
    typeof source === "object" &&
    !(source instanceof URL)
  ) {
    return {
      linguiConfig: {
        ...createFallbackLinguiConfig(),
        ...source,
        runtimeConfigModule: normalizeRuntimeConfigModule(
          source.runtimeConfigModule,
        ),
        macro: {
          corePackage: uniqueStrings([
            "@lingui/macro",
            "@lingui/core/macro",
            ...(source.macro?.corePackage ?? []),
          ]),
          jsxPackage: uniqueStrings([
            "@lingui/macro",
            "@lingui/react/macro",
            ...(source.macro?.jsxPackage ?? []),
          ]),
        },
      },
    };
  }

  const configPath =
    source instanceof URL ? fileURLToPath(source) : (source ?? undefined);

  try {
    return {
      linguiConfig: getConfig({
        cwd: root,
        ...(configPath != null ? { configPath } : {}),
        skipValidation: false,
      }),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "No Lingui config found") {
      throw new Error(
        "unplugin-lingui-macro requires a Lingui config file or explicit config object.",
      );
    }
    throw error;
  }
}

export const unplugin: UnpluginInstance<LinguiMacroPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
