import { describe, expect, it } from "vite-plus/test";

import { unpluginFactory } from "./index.ts";

describe("lingui-for-astro unplugin", () => {
  it("moves the plugin ahead of Astro compilation in Vite", () => {
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
        { name: "astro:build" },
        { name: "lingui-for-astro" },
        { name: "vite:import-analysis" },
      ],
    };

    runConfigResolved?.call({} as never, config as never);

    expect(config.plugins.map((entry) => entry.name)).toEqual([
      "vite:pre-alias",
      "lingui-for-astro",
      "astro:build",
      "vite:import-analysis",
    ]);
  });

  it("skips .astro files that do not reference lingui-for-astro macros", async () => {
    const plugin = unpluginFactory(undefined, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    expect(runTransform).toBeTypeOf("function");

    await expect(
      runTransform?.call({} as never, "<p>Hello</p>", "/virtual/Page.astro"),
    ).resolves.toBeNull();
  });
});
