import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createLinguiConfigResolver,
  defineConfig,
  getParserPlugins,
  loadLinguiConfig,
} from "./config.ts";

const configModuleUrl = new URL("./config.ts", import.meta.url).href;

declare module "./config.ts" {
  interface LinguiForFrameworkRegistry {
    astro: {
      packages?: readonly string[] | undefined;
      whitespace?: string | undefined;
    };
    svelte: {
      packages?: readonly string[] | undefined;
      whitespace?: string | undefined;
    };
  }
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe("config helpers", () => {
  test("returns parser plugins with optional typescript support", () => {
    expect(getParserPlugins()).toEqual([
      "importAttributes",
      "explicitResourceManagement",
      "decoratorAutoAccessors",
      "deferredImportEvaluation",
      "jsx",
    ]);
    expect(getParserPlugins({ typescript: true })).toEqual([
      "importAttributes",
      "explicitResourceManagement",
      "decoratorAutoAccessors",
      "deferredImportEvaluation",
      "typescript",
      "jsx",
    ]);
  });

  test("strips framework metadata from direct config objects while preserving it for our loader", async () => {
    const loaded = await loadLinguiConfig(
      defineConfig({
        locales: ["en"],
        sourceLocale: "en",
        framework: {
          svelte: {
            packages: ["custom-svelte-macro"],
          },
        },
      }),
      {
        cwd: "/virtual/project",
      },
    );

    expect.assert(loaded != null);
    expect(loaded.frameworkConfig).toEqual({
      svelte: {
        packages: ["custom-svelte-macro"],
      },
    });
    expect(loaded.linguiConfig.rootDir).toBe("/virtual/project");
    expect(Object.hasOwn(loaded.linguiConfig, "framework")).toBe(false);
  });

  test("loads a discovered lingui.config.ts file with jiti and framework metadata", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "lingui-for-config-"));
    tempDirs.push(fixtureDir);

    writeFileSync(
      path.join(fixtureDir, "lingui.config.ts"),
      [
        `import { defineConfig } from ${JSON.stringify(configModuleUrl)};`,
        "",
        "export default defineConfig({",
        "  locales: ['en'],",
        "  sourceLocale: 'en',",
        "  framework: {",
        "    astro: {",
        "      packages: ['custom-astro-macro'],",
        "    },",
        "  },",
        "});",
        "",
      ].join("\n"),
    );

    const loaded = await loadLinguiConfig(undefined, { cwd: fixtureDir });

    expect.assert(loaded != null);
    expect(loaded.frameworkConfig).toEqual({
      astro: {
        packages: ["custom-astro-macro"],
      },
    });
    expect(loaded.linguiConfig.resolvedConfigPath).toBe(
      path.join(fixtureDir, "lingui.config.ts"),
    );
    expect(loaded.linguiConfig.rootDir).toBe(fixtureDir);
  });

  test("loads an explicit config URL", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "lingui-for-config-"));
    tempDirs.push(fixtureDir);
    const configPath = path.join(fixtureDir, "lingui.config.mjs");

    writeFileSync(
      configPath,
      [
        `import { defineConfig } from ${JSON.stringify(configModuleUrl)};`,
        "",
        "export default defineConfig({",
        "  locales: ['en'],",
        "  sourceLocale: 'en',",
        "  framework: {",
        "    svelte: {",
        "      whitespace: 'jsx',",
        "    },",
        "  },",
        "});",
        "",
      ].join("\n"),
    );

    const loaded = await loadLinguiConfig(pathToFileURL(configPath), {
      cwd: fixtureDir,
    });

    expect.assert(loaded != null);
    expect(loaded.frameworkConfig).toEqual({
      svelte: {
        whitespace: "jsx",
      },
    });
    expect(loaded.linguiConfig.resolvedConfigPath).toBe(configPath);
  });

  test("returns null when no Lingui config file is found", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "lingui-for-config-"));
    tempDirs.push(fixtureDir);

    await expect(
      loadLinguiConfig(undefined, { cwd: fixtureDir }),
    ).resolves.toBeNull();
  });

  test("warns once when a framework config is provided without defineConfig", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadLinguiConfig({
      locales: ["en"],
      framework: {
        svelte: {
          packages: ["custom-svelte-macro"],
        },
      },
    });
    await loadLinguiConfig({
      locales: ["en"],
      framework: {
        astro: {
          packages: ["custom-astro-macro"],
        },
      },
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("defineConfig");
    warn.mockRestore();
  });

  test("reuses a finalized root discovery promise", async () => {
    const calls: string[] = [];
    const resolver = createLinguiConfigResolver({
      loadConfig: async (_source, options) => {
        calls.push(options?.cwd ?? "<missing>");
        return {
          linguiConfig: {} as never,
          frameworkConfig: {},
        };
      },
      missingConfigMessage: "missing config",
    });

    resolver.finalizeRoot("/workspace");
    resolver.finalizeRoot("/other-workspace");

    await expect(resolver.getConfig()).resolves.toEqual({
      linguiConfig: {},
      frameworkConfig: {},
    });
    expect(calls).toEqual(["/workspace"]);
  });

  test("throws when config is requested before discovery has been finalized", async () => {
    const resolver = createLinguiConfigResolver({
      loadConfig: async () => ({
        linguiConfig: {} as never,
        frameworkConfig: {},
      }),
      missingConfigMessage: "missing config",
    });

    await expect(() => resolver.getConfig()).rejects.toThrow("missing config");
  });
});
