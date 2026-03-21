import { describe, expect, it } from "vite-plus/test";

import { transformComponentMacro } from "./component-macro.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("transform/component-macro", () => {
  it("lowers component macros to RuntimeTrans-compatible Astro markup", () => {
    const code = compact(
      transformComponentMacro(
        '<Trans>Read the <a href="/docs">docs</a>.</Trans>',
        new Map([["Trans", "Trans"]]),
        { filename: "/virtual/Page.astro" },
      ).code,
    );

    expect(code).toContain("<L4aRuntimeTrans {.../*i18n*/ {");
    expect(code).toContain('message: "Read the <0>docs</0>."');
    expect(code).toContain('tag: "a"');
  });
});
