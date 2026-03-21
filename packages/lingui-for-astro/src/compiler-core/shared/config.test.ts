import { describe, expect, test } from "vite-plus/test";

import { getParserPlugins, normalizeLinguiConfig } from "./config.ts";

describe("shared/config", () => {
  test("normalizes Lingui config for astro runtime and macro packages", () => {
    const config = normalizeLinguiConfig();

    expect(config.macro?.corePackage).toContain("lingui-for-astro/macro");
    expect(config.runtimeConfigModule.Trans[0]).toBe(
      "lingui-for-astro/runtime",
    );
  });

  test("returns parser plugins including typescript and jsx", () => {
    const plugins = getParserPlugins();

    expect(plugins).toContain("typescript");
    expect(plugins).toContain("jsx");
  });
});
