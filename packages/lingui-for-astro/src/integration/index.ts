import type { AstroIntegration } from "astro";

import type { LinguiAstroMdxPluginOptions } from "../mdx/unplugin/types";
import viteLinguiForAstroMdx from "../mdx/unplugin/vite";
import type { LinguiAstroPluginOptions } from "../unplugin/types";
import viteLinguiForAstro from "../unplugin/vite";

/**
 * Options for the Astro integration entrypoint.
 *
 * This bundles the core `.astro` transform and optional MDX support under a
 * single Astro integration so applications can enable Lingui with one setup
 * call.
 */
export interface LinguiAstroIntegrationOptions extends LinguiAstroPluginOptions {
  /**
   * Enables or configures MDX support.
   *
   * Pass `false` to disable MDX transforms entirely, `true` to enable them
   * with the core plugin options, or an object to configure MDX-specific
   * plugin behavior. Keep this aligned with your Lingui extractor setup:
   * when MDX support is enabled here, add {@link lingui-for-astro/extractor#mdxExtractor} to the
   * configured extractors; when it is disabled here, remove that extractor.
   *
   * @default true
   */
  mdx?: boolean | LinguiAstroMdxPluginOptions | undefined;
}

/**
 * Creates the Astro integration that wires Lingui support into `.astro`
 * files and, optionally, `.mdx` files.
 *
 * @param options Integration options for the core Astro transform and optional
 * MDX support. Defaults to `{}`.
 * @returns An `AstroIntegration` that injects the required Vite plugins into
 * the active Astro config.
 */
function linguiForAstro(
  options: LinguiAstroIntegrationOptions = {},
): AstroIntegration {
  const { mdx = true, ...pluginOptions } = options;

  return {
    name: "lingui-for-astro",
    hooks: {
      "astro:config:done": ({ config }) => {
        config.vite ??= {};
        config.vite.plugins ??= [];
        config.vite.plugins.unshift(viteLinguiForAstro(pluginOptions));
        if (mdx !== false) {
          const mdxOptions = mdx === true ? pluginOptions : mdx;
          config.vite.plugins.push(viteLinguiForAstroMdx(mdxOptions));
        }
      },
    },
  } satisfies AstroIntegration;
}

export default linguiForAstro;
