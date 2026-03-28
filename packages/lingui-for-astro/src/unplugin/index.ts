import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import {
  reorderPluginBeforeMatcher,
  stripQuery,
} from "@lingui-for/internal-shared-common";
import {
  mayContainLinguiMacroImport,
  toUnpluginSourceMap,
} from "@lingui-for/internal-shared-compile";

import { PACKAGE_MACRO } from "../compile/common/constants.ts";
import { transformAstro } from "../compile/transform/index.ts";
import type { LinguiAstroPluginOptions } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  LinguiAstroPluginOptions | undefined
> = (options) => ({
  name: "lingui-for-astro",
  enforce: "pre",
  async transform(code, id) {
    if (id.startsWith("\0")) {
      return null;
    }

    const filename = stripQuery(id);
    if (
      filename !== id ||
      !filename.endsWith(".astro") ||
      !mayContainLinguiMacroImport(code, PACKAGE_MACRO)
    ) {
      return null;
    }

    const transformed = await transformAstro(code, {
      filename,
      linguiConfig: options?.linguiConfig,
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
      reorderPluginBeforeMatcher(
        config.plugins as (typeof config.plugins)[number][],
        "lingui-for-astro",
        /^astro:build/,
      );
    },
  },
});

export const unplugin: UnpluginInstance<LinguiAstroPluginOptions | undefined> =
  createUnplugin(unpluginFactory);

export default unplugin;
