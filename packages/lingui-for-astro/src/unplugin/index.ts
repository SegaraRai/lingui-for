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
import { transformAstro } from "../compile/transform/index.ts";
import type { LinguiAstroPluginOptions } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  LinguiAstroPluginOptions | undefined
> = (options, meta) => {
  let isDev = false;
  const configResolver = createLinguiConfigResolver({
    loadConfig: loadLinguiConfig,
    config: options?.config,
    missingConfigMessage:
      "lingui-for-astro could not resolve a Lingui config. Pass `config` explicitly, or run the plugin from a project root that contains `lingui.config.*`.",
  });

  return {
    name: "lingui-for-astro",
    enforce: "pre",
    async transform(code, id) {
      if (id.startsWith("\0")) {
        return null;
      }

      const filename = stripQuery(id);
      if (filename !== id || !filename.endsWith(".astro")) {
        return null;
      }

      const activeConfig = await configResolver.getConfig();

      const astroPackages = [
        PACKAGE_MACRO,
        ...(activeConfig.frameworkConfig.packages ?? []),
      ];
      if (!mayContainLinguiMacroImport(code, astroPackages)) {
        return null;
      }

      const runtimeWarnings =
        activeConfig.frameworkConfig.runtimeWarnings ??
        (isDev
          ? { transContentOverride: "on" }
          : { transContentOverride: "off" });

      const transformed = await transformAstro(code, {
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
          "lingui-for-astro",
          /^unplugin-strip-whitespace$|^astro:build/,
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

export const unplugin: UnpluginInstance<LinguiAstroPluginOptions | undefined> =
  createUnplugin(unpluginFactory);

export default unplugin;
