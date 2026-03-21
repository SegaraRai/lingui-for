import { describe, expect, it } from "vite-plus/test";

import { transformComponentExtractionUnit } from "./component-macro.ts";

describe("transformComponentExtractionUnit", () => {
  it("builds extraction code for component macros", () => {
    const source = '<Trans>Read the <a href="/docs">docs</a>.</Trans>';
    const unit = transformComponentExtractionUnit(
      source,
      source,
      0,
      new Map([["Trans", "Trans"]]),
      { filename: "/virtual/Page.astro" },
    );

    expect(unit.code).toContain("/*i18n*/");
    expect(unit.code).toContain("RuntimeTrans as _Trans");
    expect(unit.code).toContain('message: "Read the <0>docs</0>."');
  });
});
