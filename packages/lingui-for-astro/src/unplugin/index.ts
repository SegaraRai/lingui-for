import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import { stripQuery } from "lingui-for-shared/compiler";

import { mayContainLinguiMacroImport } from "../compiler-core/shared/macro-presence.ts";
import { transformAstro } from "../compiler-core/transform/index.ts";
import type { LinguiAstroPluginOptions } from "./types.ts";

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
  name: "lingui-for-astro",
  enforce: "pre",
  async transform(code, id) {
    if (id.startsWith("\0")) {
      return null;
    }

    const filename = stripQuery(id);
    if (filename !== id) {
      return null;
    }

    if (filename.endsWith(".astro")) {
      if (!mayContainLinguiMacroImport(code)) {
        return null;
      }

      const transformed = transformAstro(code, {
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
    configResolved(config) {
      reorderBeforeMatcher(
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
