import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import { stripQuery } from "@lingui-for/internal-shared-common";
import { toUnpluginSourceMap } from "@lingui-for/internal-shared-compile";

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
  plugins.splice(targetIndex, 0, plugin);
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
    if (
      filename !== id ||
      !filename.endsWith(".astro") ||
      !mayContainLinguiMacroImport(code)
    ) {
      return null;
    }

    const transformed = await transformAstro(code, {
      filename,
      linguiConfig: options?.linguiConfig,
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
