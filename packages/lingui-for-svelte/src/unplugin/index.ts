import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import { stripQuery } from "@lingui-for/internal-shared-common";
import {
  mayContainLinguiMacroImport,
  toUnpluginSourceMap,
} from "@lingui-for/internal-shared-compile";

import { PACKAGE_MACRO } from "../compile/common/constants.ts";
import { transformSvelte } from "../compile/transform/index.ts";
import type { LinguiSveltePluginOptions } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  LinguiSveltePluginOptions | undefined
> = (options, meta) => {
  let isDev = false;

  return {
    name: "lingui-for-svelte",
    enforce: "pre",
    async transform(code, id) {
      if (id.startsWith("\0")) {
        return null;
      }

      const filename = stripQuery(id);
      if (
        filename !== id ||
        !filename.endsWith(".svelte") ||
        !mayContainLinguiMacroImport(code, PACKAGE_MACRO)
      ) {
        return null;
      }

      const runtimeWarnings =
        options?.runtimeWarnings ??
        (isDev
          ? { transContentOverride: "on" }
          : { transContentOverride: "off" });

      const transformed = await transformSvelte(code, {
        filename,
        linguiConfig: options?.linguiConfig,
        runtimeWarnings,
        whitespace: options?.whitespace,
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
      configResolved(config) {
        isDev = config.command === "serve";
      },
    },
    webpack(compiler) {
      isDev = compiler.options.mode === "development";
    },
    buildStart() {
      if (
        (meta.framework === "rollup" || meta.framework === "rolldown") &&
        meta.watchMode != null
      ) {
        isDev = meta.watchMode;
      }
    },
  };
};

// TODO: Remove type assertion once tsdown builds successfully without it.
export const unplugin: UnpluginInstance<LinguiSveltePluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
