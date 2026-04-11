import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import {
  mayContainLinguiMacroImport,
  reorderPluginBeforeMatcher,
  stripQuery,
  toUnpluginSourceMap,
} from "@lingui-for/framework-core/compile";
import { createLinguiConfigResolver } from "@lingui-for/framework-core/config";

import { loadLinguiConfig } from "../compile/common/config.ts";
import { PACKAGE_MACRO } from "../compile/common/constants.ts";
import { transformSvelte } from "../compile/transform/index.ts";
import type { LinguiSveltePluginOptions } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  LinguiSveltePluginOptions | undefined
> = (options, meta) => {
  let isDev = false;
  const configResolver = createLinguiConfigResolver({
    loadConfig: loadLinguiConfig,
    config: options?.config,
    missingConfigMessage:
      "lingui-for-svelte could not resolve a Lingui config. Pass `config` explicitly, or run the plugin from a project root that contains `lingui.config.*`.",
  });

  return {
    name: "lingui-for-svelte",
    enforce: "pre",
    async transform(code, id) {
      if (id.startsWith("\0")) {
        return null;
      }

      const filename = stripQuery(id);
      if (filename !== id || !filename.endsWith(".svelte")) {
        return null;
      }

      const activeConfig = await configResolver.getConfig();

      const sveltePackages = [
        PACKAGE_MACRO,
        ...(activeConfig.frameworkConfig.packages ?? []),
      ];
      if (!mayContainLinguiMacroImport(code, sveltePackages)) {
        return null;
      }

      const runtimeWarnings =
        activeConfig.frameworkConfig.runtimeWarnings ??
        (isDev
          ? { transContentOverride: "on" }
          : { transContentOverride: "off" });

      const transformed = await transformSvelte(code, {
        filename,
        linguiConfig: activeConfig.linguiConfig,
        frameworkConfig: {
          ...activeConfig.frameworkConfig,
          runtimeWarnings,
          whitespace: activeConfig.frameworkConfig.whitespace,
        },
      });
      if (transformed == null) {
        return null;
      }

      return {
        code: transformed.code,
        map:
          transformed.map != null ? toUnpluginSourceMap(transformed.map) : null,
      };
    },
    vite: {
      async configResolved(config) {
        isDev = config.command === "serve";
        configResolver.finalizeRoot(config.root);
        await configResolver.getConfig(); // fail fast

        reorderPluginBeforeMatcher(
          config.plugins as (typeof config.plugins)[number][],
          "lingui-for-svelte",
          /^unplugin-strip-whitespace$|^vite-plugin-svelte$/,
        );
      },
    },
    webpack(compiler) {
      isDev = compiler.options.mode === "development";
      configResolver.finalizeRoot(compiler.context);
    },
    async buildStart() {
      if (
        (meta.framework === "rollup" || meta.framework === "rolldown") &&
        meta.watchMode != null
      ) {
        isDev = meta.watchMode;
      }
      configResolver.finalizeRoot(process.cwd());
      await configResolver.getConfig(); // fail fast
    },
  };
};

// TODO: Remove type assertion once tsdown builds successfully without it.
export const unplugin: UnpluginInstance<LinguiSveltePluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
