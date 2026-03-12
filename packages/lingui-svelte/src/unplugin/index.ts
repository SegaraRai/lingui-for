import type { LinguiConfig } from "@lingui/conf";
import { createUnplugin } from "unplugin";

import {
  isTransformableScript,
  transformJavaScriptMacros,
  transformSvelte,
} from "../compiler-core/index.ts";

export type LinguiSveltePluginOptions = {
  linguiConfig?: Partial<LinguiConfig>;
};

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

export const linguiSvelte = createUnplugin<
  LinguiSveltePluginOptions | undefined
>((options) => ({
  name: "lingui-svelte",
  enforce: "pre",
  transform(code, id) {
    const filename = stripQuery(id);
    if (filename !== id) {
      return null;
    }

    if (filename.endsWith(".svelte")) {
      const transformed = transformSvelte(code, {
        filename,
        linguiConfig: options?.linguiConfig,
      });

      return {
        code: transformed.code,
        map: null,
      };
    }

    if (isTransformableScript(filename)) {
      const transformed = transformJavaScriptMacros(code, {
        filename,
        linguiConfig: options?.linguiConfig,
      });

      if (!transformed) {
        return null;
      }

      return {
        code: transformed.code,
        map: null,
      };
    }

    return null;
  },
  vite: {
    enforce: "pre",
  },
}));

export default linguiSvelte;
