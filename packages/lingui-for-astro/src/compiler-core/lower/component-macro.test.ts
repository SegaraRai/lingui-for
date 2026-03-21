import { describe, expect, it } from "vite-plus/test";

import { lowerComponentMacro } from "./component-macro.ts";

describe("lower/component-macro", () => {
  it("lowers component macros for compile and extract", () => {
    const source = '<Trans>Read the <a href="/docs">docs</a>.</Trans>';

    const compileLowered = lowerComponentMacro(
      source,
      new Map([["Trans", "Trans"]]),
      { filename: "/virtual/Page.astro" },
      { extract: false },
    );
    const extractLowered = lowerComponentMacro(
      source,
      new Map([["Trans", "Trans"]]),
      { filename: "/virtual/Page.astro" },
      { extract: true },
    );

    expect(compileLowered.code).toContain("<L4aRuntimeTrans");
    expect(extractLowered.code).toContain("RuntimeTrans as _Trans");
    expect(extractLowered.code).toContain("/*i18n*/");
  });
});
