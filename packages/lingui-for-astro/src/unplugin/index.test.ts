import type { UnpluginBuildContext, UnpluginContext } from "unplugin";
import { describe, expect, test } from "vite-plus/test";

import { unpluginFactory } from "./index.ts";

describe("lingui-for-astro unplugin", () => {
  const config = {
    config: {
      locales: ["en"],
    },
  };

  test("moves the plugin ahead of Astro compilation in Vite", async () => {
    const plugin = unpluginFactory(config, { framework: "vite" });
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
        { name: "astro:build" },
        { name: "lingui-for-astro" },
        { name: "vite:import-analysis" },
      ],
    };

    await runConfigResolved?.call({} as any, viteConfig as any);

    expect(viteConfig.plugins.map((entry) => entry.name)).toEqual([
      "vite:pre-alias",
      "lingui-for-astro",
      "astro:build",
      "vite:import-analysis",
    ]);
  });

  test("moves the plugin ahead of strip-whitespace in Vite", async () => {
    const plugin = unpluginFactory(config, { framework: "vite" });
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
        { name: "lingui-for-astro" },
        { name: "astro:build" },
      ],
    };

    await runConfigResolved?.call({} as any, viteConfig as any);

    expect(viteConfig.plugins.map((entry) => entry.name)).toEqual([
      "vite:pre-alias",
      "lingui-for-astro",
      "unplugin-strip-whitespace",
      "astro:build",
    ]);
  });

  test("skips .astro files that do not reference lingui-for-astro macros", async () => {
    const plugin = unpluginFactory(config, { framework: "vite" });
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
        createUnpluginContext(),
        "<p>Hello</p>",
        "/virtual/Page.astro",
      ),
    ).resolves.toBeNull();
  });

  test("respects custom macro package names from framework config", async () => {
    const plugin = unpluginFactory(
      {
        config: {
          locales: ["en"],
          framework: {
            astro: {
              packages: ["@acme/astro-macro"],
            },
          },
        },
      },
      { framework: "vite" },
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
        createUnpluginContext(),
        '---\nimport { t } from "@acme/astro-macro";\n---\n<p>{t`Hello`}</p>',
        "/virtual/Page.astro",
      ),
    ).resolves.not.toBeNull();
  });

  test("treats custom macro package names as replacements", async () => {
    const plugin = unpluginFactory(
      {
        config: {
          locales: ["en"],
          framework: {
            astro: {
              packages: ["@acme/astro-macro"],
            },
          },
        },
      },
      { framework: "vite" },
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
        createUnpluginContext(),
        '---\nimport { t } from "lingui-for-astro/macro";\n---\n<p>{t`Hello`}</p>',
        "/virtual/Page.astro",
      ),
    ).resolves.toBeNull();
  });

  test("throws when no Lingui config file is found", async () => {
    const plugin = unpluginFactory(undefined, { framework: "vite" });
    const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
    if (!pluginInstance) {
      throw new Error("Plugin instance is undefined");
    }
    const transform = pluginInstance.transform;
    const runTransform =
      typeof transform === "function" ? transform : transform?.handler;

    await expect(
      runTransform?.call(
        createUnpluginContext(),
        '---\nimport { t } from "lingui-for-astro/macro";\n---',
        "/virtual/Page.astro",
      ),
    ).rejects.toThrow("lingui-for-astro could not resolve a Lingui config.");
  });
});

function createUnpluginContext(): UnpluginBuildContext & UnpluginContext {
  return {} as UnpluginBuildContext & UnpluginContext;
}
