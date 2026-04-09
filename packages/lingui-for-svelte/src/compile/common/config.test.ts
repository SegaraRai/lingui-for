import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  getParserPlugins,
  loadLinguiConfig,
  normalizeLinguiConfig,
} from "./config.ts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe("normalizeLinguiConfig", () => {
  test("adds lingui-for-svelte macro packages and runtime bindings", () => {
    const config = normalizeLinguiConfig();
    const macro = config.macro!;

    expect(macro.corePackage).toEqual([
      "lingui-for-svelte/macro",
      "@lingui/core/macro",
      "@lingui/macro",
    ]);
    expect(macro.jsxPackage).toEqual(["lingui-for-svelte/macro"]);
    expect(config.runtimeConfigModule.i18n).toEqual(["@lingui/core", "i18n"]);
    expect(config.runtimeConfigModule.Trans).toEqual([
      "lingui-for-svelte/runtime",
      "RuntimeTrans",
    ]);
  });

  test("preserves explicit overrides", () => {
    const config = normalizeLinguiConfig(
      {
        runtimeConfigModule: {
          i18n: ["custom-runtime", "customI18n"],
        },
        macro: {
          corePackage: ["custom-macro"],
        },
      },
      {
        packages: ["custom-svelte-macro"],
      },
    );
    const macro = config.macro!;

    expect(config.runtimeConfigModule.i18n).toEqual([
      "custom-runtime",
      "customI18n",
    ]);
    expect(macro.corePackage).toContain("custom-macro");
    expect(macro.corePackage).toContain("lingui-for-svelte/macro");
    expect(macro.jsxPackage).toContain("custom-svelte-macro");
    expect(macro.jsxPackage).toContain("lingui-for-svelte/macro");
  });
});

describe("getParserPlugins", () => {
  test("includes typescript only for ts sources", () => {
    expect(getParserPlugins("ts")).toContain("typescript");
    expect(getParserPlugins("js")).not.toContain("typescript");
    expect(getParserPlugins("js")).toContain("jsx");
  });

  test("throws when no Lingui config file is found", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "lingui-for-svelte-"));
    tempDirs.push(fixtureDir);

    await expect(
      loadLinguiConfig(undefined, { cwd: fixtureDir }),
    ).rejects.toThrow(
      "lingui-for-svelte requires a Lingui config file or explicit config object.",
    );
  });
});
