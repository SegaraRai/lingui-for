import { describe, expect, it } from "vite-plus/test";

import { getParserPlugins, normalizeLinguiConfig } from "./config.ts";

describe("normalizeLinguiConfig", () => {
  it("adds lingui-for-svelte macro packages and runtime bindings", () => {
    const config = normalizeLinguiConfig();
    const macro = config.macro!;

    expect(macro.corePackage).toContain("lingui-for-svelte/macro");
    expect(macro.jsxPackage).toContain("lingui-for-svelte/macro");
    expect(config.runtimeConfigModule.i18n).toEqual(["@lingui/core", "i18n"]);
    expect(config.runtimeConfigModule.Trans).toEqual([
      "lingui-for-svelte/runtime",
      "RuntimeTrans",
    ]);
  });

  it("preserves explicit overrides", () => {
    const config = normalizeLinguiConfig({
      runtimeConfigModule: {
        i18n: ["custom-runtime", "customI18n"],
      },
      macro: {
        corePackage: ["custom-macro"],
      },
    });
    const macro = config.macro!;

    expect(config.runtimeConfigModule.i18n).toEqual([
      "custom-runtime",
      "customI18n",
    ]);
    expect(macro.corePackage).toContain("custom-macro");
    expect(macro.corePackage).toContain("lingui-for-svelte/macro");
  });
});

describe("getParserPlugins", () => {
  it("includes typescript only for ts sources", () => {
    expect(getParserPlugins("ts")).toContain("typescript");
    expect(getParserPlugins("js")).not.toContain("typescript");
    expect(getParserPlugins("js")).toContain("jsx");
  });
});
