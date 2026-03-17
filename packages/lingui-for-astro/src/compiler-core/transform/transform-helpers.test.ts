import dedent from "dedent";
import { describe, expect, it } from "vitest";

import {
  buildFrontmatterPrelude,
  isExtractionCodeRelevant,
  transformComponentExtractionUnit,
  transformComponentMacro,
  transformExpressionExtractionUnit,
  transformFrontmatter,
  transformFrontmatterExtractionUnit,
  transformTemplateExpression,
} from "./transform-helpers.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("transform helpers", () => {
  it("builds only the requested frontmatter prelude bindings", () => {
    expect(compact(buildFrontmatterPrelude(true, true))).toContain(
      'import { getLinguiContext as __l4a_getLinguiContext } from "lingui-for-astro/runtime";',
    );
    expect(compact(buildFrontmatterPrelude(true, true))).toContain(
      'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
    );
    expect(buildFrontmatterPrelude(false, false)).toBe("");
  });

  it("rewrites frontmatter macros against the Astro runtime i18n binding", () => {
    const source = dedent`
      import { t } from "lingui-for-astro/macro";
      const label = t\`Welcome\`;
    `;

    const code = compact(
      transformFrontmatter(source, {
        filename: "/virtual/Page.astro",
      }),
    );

    expect(code).not.toContain('from "lingui-for-astro/macro"');
    expect(code).toContain("const label = __l4a_i18n._(");
  });

  it("rewrites template expressions against imported macro bindings", () => {
    const code = transformTemplateExpression(
      "t`Hello ${name}`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
    );

    expect(code).toContain("__l4a_i18n._(");
    expect(code).toContain('message: "Hello {name}"');
  });

  it("lowers component macros to RuntimeTrans-compatible Astro markup", () => {
    const code = compact(
      transformComponentMacro(
        '<Trans>Read the <a href="/docs">docs</a>.</Trans>',
        new Map([["Trans", "Trans"]]),
        { filename: "/virtual/Page.astro" },
      ),
    );

    expect(code).toContain("<L4aRuntimeTrans {...{");
    expect(code).toContain('message: "Read the <0>docs</0>."');
    expect(code).toContain('tag: "a"');
  });

  it("builds extraction units for frontmatter, expressions, and components", () => {
    const frontmatter = transformFrontmatterExtractionUnit(
      'import { t } from "lingui-for-astro/macro";\nconst label = t`Welcome`;',
      { filename: "/virtual/Page.astro" },
    );
    const expression = transformExpressionExtractionUnit(
      "t`Extract me`",
      new Map([["t", "t"]]),
      { filename: "/virtual/Page.astro" },
    );
    const component = transformComponentExtractionUnit(
      '<Trans>Read the <a href="/docs">docs</a>.</Trans>',
      new Map([["Trans", "Trans"]]),
      { filename: "/virtual/Page.astro" },
    );

    expect(frontmatter.code).toContain("/*i18n*/");
    expect(expression.code).toContain("/*i18n*/");
    expect(component.code).toContain("/*i18n*/");
    expect(component.code).toContain("RuntimeTrans as _Trans");
  });

  it("detects whether extraction output contains Lingui markers", () => {
    expect(isExtractionCodeRelevant("const a = 1;")).toBe(false);
    expect(isExtractionCodeRelevant("/*i18n*/ const a = 1;")).toBe(true);
  });
});
