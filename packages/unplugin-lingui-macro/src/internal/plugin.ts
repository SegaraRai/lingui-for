import { fileURLToPath } from "node:url";

import { transformAsync, type PluginItem } from "@babel/core";
import type { ParserOptions } from "@babel/parser";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { getConfig, type LinguiConfig } from "@lingui/conf";
import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
  type UnpluginOptions,
  type SourceMapCompact,
} from "unplugin";

import {
  createLinguiMacroPluginOptions,
  resolveLinguiMacroPluginMajorVersion,
  stripQuery,
} from "@lingui-for/internal-shared-common";

import type {
  LinguiMacroPluginOptions,
  LinguiNativeMacroTransformOptions,
} from "../types.ts";
import { hasImport } from "./imports.ts";

type NativeTools = typeof import("@lingui/native-tools");

const LINGUI_MACRO_PLUGIN_ENTRY_URL = import.meta
  .resolve("@lingui/babel-plugin-lingui-macro");

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
  | NonNullable<ParserOptions["plugins"]>[number]
  | "importAttributes"
  | "explicitResourceManagement"
  | "decoratorAutoAccessors"
  | "deferredImportEvaluation";

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
): NonNullable<ParserOptions["plugins"]> {
  const plugins: BabelParserPlugin[] = [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
  ];

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

  return plugins as NonNullable<ParserOptions["plugins"]>;
}

function toUnpluginSourceMap(
  map: NonNullable<
    NonNullable<Awaited<ReturnType<typeof transformAsync>>>["map"]
  >,
): SourceMapCompact {
  return {
    file: map.file ?? undefined,
    mappings: map.mappings,
    names: [...map.names],
    sourceRoot: map.sourceRoot ?? undefined,
    sources: map.sources.map((source) => source ?? ""),
    sourcesContent: map.sourcesContent ? [...map.sourcesContent] : undefined,
    version: map.version,
  };
}

let nativeToolsPromise: Promise<NativeTools> | undefined;

function loadNativeTools(): Promise<NativeTools> {
  nativeToolsPromise ??= import("@lingui/native-tools").then(
    (module) =>
      // `@lingui/native-tools` is CommonJS; fall back to the default export if the named exports
      // are not detected by the host's CommonJS interop.
      ("transform" in module
        ? module
        : (module as { default: NativeTools }).default) as NativeTools,
    (error: unknown) => {
      nativeToolsPromise = undefined;
      throw new Error(
        'unplugin-lingui-macro: the `native` option requires "@lingui/native-tools". Install it as a dependency of your project.',
        { cause: error },
      );
    },
  );
  return nativeToolsPromise;
}

function resolveNativeOptions(
  native: LinguiMacroPluginOptions["native"],
): LinguiNativeMacroTransformOptions | undefined {
  if (native == null || native === false) {
    return undefined;
  }
  return native === true ? {} : native;
}

async function transformWithNativeTools(
  code: string,
  filename: string,
  linguiConfig: LoadedLinguiMacroConfig,
  options: LinguiNativeMacroTransformOptions,
): Promise<{ code: string; map: string | undefined }> {
  const { transform, mapMacroOptions } = await loadNativeTools();

  const result = await transform(code, filename, {
    macro: mapMacroOptions(
      linguiConfig as Parameters<typeof mapMacroOptions>[0],
      {
        // The native transformer generates Lingui 6 ids by default. Keep ids compatible with the
        // installed Lingui version so they match catalogs extracted by the Lingui CLI.
        ...(resolveLinguiMacroPluginMajorVersion(
          LINGUI_MACRO_PLUGIN_ENTRY_URL,
        ) === 5
          ? { useLinguiV5IdGeneration: true }
          : {}),
        ...options.macro,
      },
    ),
    ...(options.parser != null ? { parser: options.parser } : {}),
  });

  return {
    code: result.code,
    map: result.map,
  };
}

export const unpluginFactory: UnpluginFactory<
  LinguiMacroPluginOptions | undefined
> = (options) => {
  const nativeOptions = resolveNativeOptions(options?.native);
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

      if (nativeOptions != null) {
        return transformWithNativeTools(
          code,
          filename,
          linguiConfig,
          nativeOptions,
        );
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
              pluginEntryUrl: LINGUI_MACRO_PLUGIN_ENTRY_URL,
            }),
          ] as unknown as PluginItem,
        ],
      });

      if (!transformed?.code) {
        return null;
      }

      return {
        code: transformed.code,
        map: transformed.map ? toUnpluginSourceMap(transformed.map) : undefined,
      };
    },
    vite: {
      enforce: "pre",
      configResolved(config) {
        finalizeConfig(config.root);
      },
    },
    webpack(compiler: Parameters<NonNullable<UnpluginOptions["webpack"]>>[0]) {
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
          ...source.macro,
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
