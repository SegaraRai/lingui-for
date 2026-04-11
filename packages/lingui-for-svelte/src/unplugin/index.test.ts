import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { unpluginFactory } from "./index.ts";

describe("lingui-for-svelte unplugin", () => {
  const config = {
    config: {
      locales: ["en"],
    },
  };

  test("moves the plugin ahead of strip-whitespace in Vite", async () => {
    const plugin = unpluginFactory(config, { framework: "vite" } as never);
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

    const viteConfig = {
      plugins: [
        { name: "vite:pre-alias" },
        { name: "unplugin-strip-whitespace" },
        { name: "lingui-for-svelte" },
        { name: "vite-plugin-svelte" },
      ],
    };

    await runConfigResolved?.call({} as never, viteConfig as never);

    expect(viteConfig.plugins.map((entry) => entry.name)).toEqual([
      "vite:pre-alias",
      "lingui-for-svelte",
      "unplugin-strip-whitespace",
      "vite-plugin-svelte",
    ]);
  });

  test("skips non-svelte files", async () => {
    const plugin = unpluginFactory(config, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    expect(runTransform).toBeTypeOf("function");
    await expect(
      runTransform?.call({} as never, "const x = 1;", "/a.ts"),
    ).resolves.toBeNull();
  });

  test("skips .svelte files that do not reference lingui-for-svelte macros", async () => {
    const plugin = unpluginFactory(config, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    expect(runTransform).toBeTypeOf("function");
    await expect(
      runTransform?.call({} as never, "<h1>Hello</h1>", "/Component.svelte"),
    ).resolves.toBeNull();
  });

  test("respects custom macro package names from framework config", async () => {
    const plugin = unpluginFactory(
      {
        config: {
          locales: ["en"],
          framework: {
            svelte: {
              packages: ["@acme/svelte-macro"],
            },
          },
        },
      },
      { framework: "vite" } as never,
    );
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    expect(runTransform).toBeTypeOf("function");
    await expect(
      runTransform?.call(
        {} as never,
        dedent`
          <script>
            import { t } from "@acme/svelte-macro";
          </script>

          <p>{$t\`Hello\`}</p>
        `,
        "/Component.svelte",
      ),
    ).resolves.not.toBeNull();
  });

  test("throws when no Lingui config file is found", async () => {
    const plugin = unpluginFactory(undefined, { framework: "vite" } as never);
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    await expect(
      runTransform?.call(
        {} as never,
        '<script>import { t } from "lingui-for-svelte/macro";</script>',
        "/Component.svelte",
      ),
    ).rejects.toThrow("lingui-for-svelte could not resolve a Lingui config.");
  });
});
