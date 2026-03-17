import type { AstroIntegration } from "astro";

import type { LinguiAstroPluginOptions } from "../unplugin/types.ts";
import viteLinguiForAstro from "../unplugin/vite.ts";

/**
 * Options for the Astro integration entrypoint.
 *
 * This bundles the core `.astro` transform under a single Astro integration so
 * applications can enable Lingui with one setup call.
 */
export interface LinguiAstroIntegrationOptions extends LinguiAstroPluginOptions {}

/**
 * Creates the Astro integration that wires Lingui support into `.astro` files.
 *
 * @param options Integration options for the core Astro transform.
 * @returns An `AstroIntegration` that injects the required Vite plugins into
 * the active Astro config.
 */
function linguiForAstro(
  options: LinguiAstroIntegrationOptions = {},
): AstroIntegration {
  const { ...pluginOptions } = options;

  return {
    name: "lingui-for-astro",
    hooks: {
      "astro:config:done": ({ config }) => {
        config.vite ??= {};
        config.vite.plugins ??= [];
        // TODO: remove type assertion once Astro uses Vite 8
        config.vite.plugins.unshift(viteLinguiForAstro(pluginOptions) as any);
      },
    },
  } satisfies AstroIntegration;
}

export default linguiForAstro;
