import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import { PACKAGE_MACRO } from "../../compiler-core/shared/constants.ts";
import type { LinguiAstroPluginOptions } from "../../unplugin/types.ts";
import { transformMdxSource } from "../transform.ts";

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

function reorderBeforeMatcher<
  T extends {
    name?: string | readonly string[] | null | undefined;
  },
>(plugins: T[], pluginName: string, matcher: RegExp): void {
  const currentIndex = plugins.findIndex((plugin) => {
    const names = plugin.name;
    if (Array.isArray(names)) {
      return names.includes(pluginName);
    }
    return names === pluginName;
  });

  if (currentIndex === -1) {
    return;
  }

  const targetIndex = plugins.findIndex((plugin) => {
    const names = plugin.name;
    if (Array.isArray(names)) {
      return names.some((name) => matcher.test(name));
    }
    return typeof names === "string" && matcher.test(names);
  });

  if (targetIndex === -1 || currentIndex < targetIndex) {
    return;
  }

  const [plugin] = plugins.splice(currentIndex, 1);
  plugins.splice(targetIndex, 0, plugin!);
}

export const unpluginFactory: UnpluginFactory<
  LinguiAstroPluginOptions | undefined
> = (options) => ({
  name: "lingui-for-astro:mdx",
  enforce: "pre",
  async transform(code, id) {
    if (id.startsWith("\0")) {
      return null;
    }

    const filename = stripQuery(id);
    if (!filename.endsWith(".mdx")) {
      return null;
    }

    if (!code.includes(PACKAGE_MACRO)) {
      return null;
    }

    return transformMdxSource(code, {
      filename,
      linguiConfig: options?.linguiConfig,
    });
  },
  vite: {
    enforce: "pre",
    configResolved(config) {
      reorderBeforeMatcher(
        config.plugins as (typeof config.plugins)[number][],
        "lingui-for-astro:mdx",
        /^@mdx-js\/rollup$/,
      );
    },
  },
});

export const unplugin: UnpluginInstance<LinguiAstroPluginOptions | undefined> =
  createUnplugin(unpluginFactory);

export default unplugin;
