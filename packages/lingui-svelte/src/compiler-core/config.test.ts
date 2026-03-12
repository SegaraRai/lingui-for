import { describe, expect, it } from "vitest";

import { getParserPlugins, normalizeLinguiConfig } from "./config.ts";

describe("normalizeLinguiConfig", () => {
  it("adds lingui-svelte macro packages and runtime bindings", () => {
    const config = normalizeLinguiConfig();
    const macro = config.macro!;

    expect(macro.corePackage).toContain("lingui-svelte/macro");
    expect(macro.jsxPackage).toContain("lingui-svelte/macro");
    expect(config.runtimeConfigModule.i18n).toEqual([
      "lingui-svelte/runtime",
      "i18n",
    ]);
    expect(config.runtimeConfigModule.useLingui).toEqual([
      "lingui-svelte/runtime",
      "useLingui",
    ]);
    expect(config.runtimeConfigModule.Trans).toEqual([
      "lingui-svelte/runtime",
      "Trans",
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
    expect(macro.corePackage).toContain("lingui-svelte/macro");
  });
});

describe("getParserPlugins", () => {
  it("includes typescript only for ts sources", () => {
    expect(getParserPlugins("ts")).toContain("typescript");
    expect(getParserPlugins("js")).not.toContain("typescript");
    expect(getParserPlugins("js")).toContain("jsx");
  });
});
