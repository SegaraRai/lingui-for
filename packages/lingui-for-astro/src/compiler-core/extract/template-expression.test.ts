import { describe, expect, it } from "vite-plus/test";

import { transformExpressionExtractionUnit } from "./template-expression.ts";

describe("transformExpressionExtractionUnit", () => {
  it("builds extraction code for template expressions", () => {
    const unit = transformExpressionExtractionUnit(
      "t`Extract me`",
      "t`Extract me`",
      0,
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
    );

    expect(unit.code).toContain("/*i18n*/");
    expect(unit.code).toMatch(/_i18n\._\(\s*\/\*i18n\*\//);
    expect(unit.code).toContain('message: "Extract me"');
  });
});
