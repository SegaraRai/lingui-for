import { transformAsync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import type { LinguiMacroPluginOptions } from "../types.ts";
import { hasImport } from "./imports.ts";

const SCRIPT_RE = /\.[^?]*\.[cm]?[jt]sx?$|\.[cm]?[jt]sx?$/;

type RuntimeConfigModule = NonNullable<
  LinguiMacroPluginOptions["linguiConfig"]
>["runtimeConfigModule"];

type RuntimeConfigRecord = Partial<
  Record<"useLingui" | "Trans" | "i18n", readonly [string, string?]>
>;

type BabelParserPlugin =
  | "importAttributes"
  | "jsx"
  | "typescript"
  | "decorators-legacy"
  | ["flow", { all: boolean }];

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

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

  const runtimeConfig =
    runtimeConfigModule && !Array.isArray(runtimeConfigModule)
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

function normalizeLinguiConfig(
  config: LinguiMacroPluginOptions["linguiConfig"],
): NonNullable<LinguiMacroPluginOptions["linguiConfig"]> {
  return {
    ...config,
    runtimeConfigModule: normalizeRuntimeConfigModule(
      config?.runtimeConfigModule,
    ),
    macro: {
      corePackage: uniqueStrings([
        "@lingui/macro",
        "@lingui/core/macro",
        ...(config?.macro?.corePackage ?? []),
      ]),
      jsxPackage: uniqueStrings([
        "@lingui/macro",
        "@lingui/react/macro",
        ...(config?.macro?.jsxPackage ?? []),
      ]),
    },
  };
}

function getMacroPackages(
  config: NonNullable<LinguiMacroPluginOptions["linguiConfig"]>,
): string[] {
  return uniqueStrings([
    ...(config.macro?.corePackage ?? []),
    ...(config.macro?.jsxPackage ?? []),
  ]);
}

function getParserPlugins(
  filename: string,
  config: NonNullable<LinguiMacroPluginOptions["linguiConfig"]>,
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
> = (options) => ({
  name: "unplugin-lingui-macro",
  enforce: "pre",
  async transform(code, id) {
    if (id.startsWith("\0")) {
      return null;
    }

    const filename = stripQuery(id);
    const linguiConfig = normalizeLinguiConfig(options?.linguiConfig);
    if (
      filename.includes("/node_modules/") ||
      filename.includes("\\node_modules\\") ||
      !SCRIPT_RE.test(filename) ||
      !hasImport(code, filename, getMacroPackages(linguiConfig))
    ) {
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
          {
            extract: false,
            linguiConfig,
          },
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
  },
});

export const unplugin: UnpluginInstance<LinguiMacroPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
