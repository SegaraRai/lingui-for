import { describe, expect, it } from "vite-plus/test";

import { lowerTemplateExpression } from "./template-expression.ts";

describe("lower/template-expression", () => {
  it("lowers template expressions for compile and extract", () => {
    const compileLowered = lowerTemplateExpression(
      "t`Hello ${name}`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
      { extract: false },
    );
    const extractLowered = lowerTemplateExpression(
      "t`Hello ${name}`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
      { extract: true },
    );

    expect(compileLowered.code).toContain("__l4a_i18n._(");
    expect(extractLowered.code).toContain("_i18n._(");
    expect(extractLowered.code).toContain("/*i18n*/");
    expect(extractLowered.map).not.toBeNull();
  });
});
