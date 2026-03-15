import type { AstroIntegration } from "astro";

import type { LinguiAstroPluginOptions } from "../unplugin/types";
import viteLinguiForAstro from "../unplugin/vite";

function linguiForAstro(options?: LinguiAstroPluginOptions): AstroIntegration {
  return {
    name: "lingui-for-astro",
    hooks: {
      "astro:config:done": ({ config }) => {
        config.vite ??= {};
        config.vite.plugins ??= [];
        config.vite.plugins.unshift(viteLinguiForAstro(options));
      },
    },
  } satisfies AstroIntegration;
}

export default linguiForAstro;
