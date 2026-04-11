import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  getParserPlugins,
  loadLinguiConfig,
  normalizeLinguiConfig,
  resolveAstroWhitespace,
} from "./config.ts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe("compile/common/config", () => {
  test("normalizes Lingui config for astro runtime and macro packages", () => {
    const config = normalizeLinguiConfig();

    expect(config.macro?.corePackage).toEqual([
      "lingui-for-astro/macro",
      "@lingui/core/macro",
      "@lingui/macro",
    ]);
    expect(config.macro?.jsxPackage).toEqual(["lingui-for-astro/macro"]);
    expect(config.runtimeConfigModule.Trans[0]).toBe(
      "lingui-for-astro/runtime",
    );
  });

  test("accepts astro macro packages via top-level options", () => {
    const config = normalizeLinguiConfig(
      {
        macro: {
          corePackage: ["custom-core-macro"],
        },
      },
      {
        packages: ["custom-astro-macro"],
      },
    );

    expect(config.macro?.corePackage).toContain("custom-core-macro");
    expect(config.macro?.corePackage).toContain("lingui-for-astro/macro");
    expect(config.macro?.jsxPackage).toContain("custom-astro-macro");
    expect(config.macro?.jsxPackage).toContain("lingui-for-astro/macro");
  });

  test("returns parser plugins including typescript and jsx", () => {
    const plugins = getParserPlugins();

    expect(plugins).toContain("typescript");
    expect(plugins).toContain("jsx");
  });

  test("returns explicit astro whitespace modes", () => {
    expect(resolveAstroWhitespace("astro")).toBe("astro");
    expect(resolveAstroWhitespace("jsx")).toBe("jsx");
  });

  test("throws when no Lingui config file is found", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "lingui-for-astro-"));
    tempDirs.push(fixtureDir);

    await expect(
      loadLinguiConfig(undefined, { cwd: fixtureDir }),
    ).rejects.toThrow(
      "lingui-for-astro requires a Lingui config file or explicit config object.",
    );
  });
});
