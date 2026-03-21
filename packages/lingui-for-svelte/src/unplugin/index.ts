import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import {
  mayContainLinguiMacroImport,
  stripQuery,
} from "lingui-for-shared/compiler";

import { transformSvelte } from "../compiler-core/index.ts";
import { PACKAGE_MACRO } from "../compiler-core/shared/constants.ts";
import type { LinguiSveltePluginOptions } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  LinguiSveltePluginOptions | undefined
> = (options) => ({
  name: "lingui-for-svelte",
  enforce: "pre",
  transform(code, id) {
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

      const transformed = transformSvelte(code, {
        filename,
        linguiConfig: options?.linguiConfig,
      });

      return {
        code: transformed.code,
        map: transformed.map,
      };
    }

    return null;
  },
});

// TODO: Remove type assertion once tsdown builds successfully without it.
export const unplugin: UnpluginInstance<LinguiSveltePluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
