import { describe, expect, it } from "vitest";

import { unpluginFactory } from "./index.ts";

describe("lingui-for-astro mdx unplugin", () => {
  it("moves the plugin ahead of the MDX rollup transform in Vite", () => {
    const plugin = unpluginFactory(undefined, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }

    const configResolved = pluginInstance.vite?.configResolved;
    const runConfigResolved =
      typeof configResolved === "function"
        ? configResolved
        : configResolved?.handler;

    expect(runConfigResolved).toBeTypeOf("function");

    const config = {
      plugins: [
        { name: "vite:pre-alias" },
        { name: "@mdx-js/rollup" },
        { name: "lingui-for-astro:mdx" },
        { name: "vite:import-analysis" },
      ],
    };

    runConfigResolved?.call({} as never, config as never);

    expect(config.plugins.map((entry) => entry.name)).toEqual([
      "vite:pre-alias",
      "lingui-for-astro:mdx",
      "@mdx-js/rollup",
      "vite:import-analysis",
    ]);
  });
});
