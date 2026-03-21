import { describe, expect, test } from "vite-plus/test";

import { unpluginFactory } from "./index.ts";

describe("lingui-for-svelte unplugin", () => {
  test("skips non-svelte files", () => {
    const plugin = unpluginFactory(undefined, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    expect(runTransform).toBeTypeOf("function");
    expect(runTransform?.call({} as never, "const x = 1;", "/a.ts")).toBeNull();
  });

  test("skips .svelte files that do not reference lingui-for-svelte macros", () => {
    const plugin = unpluginFactory(undefined, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    expect(runTransform).toBeTypeOf("function");
    expect(
      runTransform?.call({} as never, "<h1>Hello</h1>", "/Component.svelte"),
    ).toBeNull();
  });
});
