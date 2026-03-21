import { describe, expect, it } from "vite-plus/test";

import { transformTemplateExpression } from "./template-expression.ts";

describe("transform/template-expression", () => {
  it("rewrites template expressions against imported macro bindings", () => {
    const code = transformTemplateExpression(
      "t`Hello ${name}`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
    ).code;

    expect(code).toContain("__l4a_i18n._(");
    expect(code).toContain('message: "Hello {name}"');
  });
});
