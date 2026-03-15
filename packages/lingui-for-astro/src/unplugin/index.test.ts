import { describe, expect, it } from "vitest";

import { unpluginFactory } from "./index.ts";

describe("lingui-for-astro unplugin", () => {
  it("moves the plugin ahead of Astro compilation in Vite", () => {
    const plugin = unpluginFactory();
    const configResolved = plugin.vite?.configResolved;

    expect(configResolved).toBeTypeOf("function");

    const config = {
      plugins: [
        { name: "vite:pre-alias" },
        { name: "astro:build" },
        { name: "lingui-for-astro" },
        { name: "vite:import-analysis" },
      ],
    };

    configResolved?.(config as never);

    expect(config.plugins.map((entry) => entry.name)).toEqual([
      "vite:pre-alias",
      "lingui-for-astro",
      "astro:build",
      "vite:import-analysis",
    ]);
  });
});
