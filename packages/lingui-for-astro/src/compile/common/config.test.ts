import { describe, expect, test } from "vite-plus/test";

import {
  getParserPlugins,
  normalizeLinguiConfig,
  resolveAstroWhitespace,
} from "./config.ts";

describe("compile/common/config", () => {
  test("normalizes Lingui config for astro runtime and macro packages", () => {
    const config = normalizeLinguiConfig();

    expect(config.macro?.corePackage).toContain("lingui-for-astro/macro");
    expect(config.macro?.corePackage).toContain("@lingui/core/macro");
    expect(config.macro?.jsxPackage).toContain("lingui-for-astro/macro");
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
        astroPackages: ["custom-astro-macro"],
      },
    );

    expect(config.macro?.corePackage).toContain("custom-core-macro");
    expect(config.macro?.jsxPackage).toContain("custom-astro-macro");
  });

  test("returns parser plugins including typescript and jsx", () => {
    const plugins = getParserPlugins();

    expect(plugins).toContain("typescript");
    expect(plugins).toContain("jsx");
  });

  test("defaults auto whitespace to astro semantics", () => {
    expect(resolveAstroWhitespace("auto")).toBe("astro");
    expect(resolveAstroWhitespace("jsx")).toBe("jsx");
  });
});
