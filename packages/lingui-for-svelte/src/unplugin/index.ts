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
> = (options) => ({
  name: "lingui-for-svelte",
  enforce: "pre",
  async transform(code, id) {
    if (id.startsWith("\0")) {
      return null;
    }

    const filename = stripQuery(id);
    if (filename !== id) {
      return null;
    }

    if (filename.endsWith(".svelte")) {
      if (!mayContainLinguiMacroImport(code, PACKAGE_MACRO)) {
        return null;
      }

      const transformed = await transformSvelte(code, {
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
    }

    return null;
  },
});

// TODO: Remove type assertion once tsdown builds successfully without it.
export const unplugin: UnpluginInstance<LinguiSveltePluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
