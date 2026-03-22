import { describe, expect, test } from "vite-plus/test";

import { RUNTIME_BINDING_I18N } from "../shared/constants.ts";
import { lowerTemplateExpression } from "./template-expression.ts";

describe("lower/template-expression", () => {
  test("lowers template expressions for compile and extract", () => {
    const sourceMapOptions = {
      fullSource: "t`Hello ${name}`",
      sourceStart: 0,
    };
    const compileLowered = lowerTemplateExpression(
      "t`Hello ${name}`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
      {
        extract: false,
        runtimeBinding: RUNTIME_BINDING_I18N,
        sourceMapOptions,
      },
    );
    const extractLowered = lowerTemplateExpression(
      "t`Hello ${name}`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
      { extract: true, runtimeBinding: RUNTIME_BINDING_I18N, sourceMapOptions },
    );

    expect(compileLowered.code).toContain(`${RUNTIME_BINDING_I18N}._(`);
    expect(extractLowered.code).toContain("_i18n._(");
    expect(extractLowered.code).toContain("/*i18n*/");
    expect(extractLowered.map).not.toBeNull();
  });
});
