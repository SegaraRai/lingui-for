import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import {
  mayContainLinguiMacroImport,
  transformSvelte,
} from "../compiler-core/index.ts";
import type { LinguiSveltePluginOptions } from "./types.ts";

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

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
      if (!mayContainLinguiMacroImport(code)) {
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
  vite: {
    enforce: "pre",
  },
});

// TODO: Remove type assertion once tsdown builds successfully without it.
export const unplugin: UnpluginInstance<LinguiSveltePluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
