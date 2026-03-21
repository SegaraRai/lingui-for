import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createAstroPlan } from "./astro-plan.ts";
import {
  createAstroTransformContext,
  getFrontmatterContent,
} from "./astro-transform-context.ts";

describe("createAstroTransformContext", () => {
  test("collects frontmatter, macro bindings, and macro-bearing nodes", () => {
    const source = dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";

      const plain = "ignore";
      ---

      <p>{plain}</p>
      <p>{t\`Hello\`}</p>
      <Trans>Read the <a href="/docs">docs</a>.</Trans>
    `;

    const result = createAstroTransformContext(source);

    expect(result.frontmatterContent).toContain(
      'import { t, Trans } from "lingui-for-astro/macro";',
    );
    expect(result.macroBindings.all.has("t")).toBe(true);
    expect(result.macroBindings.components.has("Trans")).toBe(true);
    expect(result.filteredExpressions).toHaveLength(1);
    expect(result.filteredComponents).toHaveLength(1);
    expect(result.usesAstroI18n).toBe(true);
    expect(result.usesRuntimeTrans).toBe(true);
  });

  test("keeps non-macro expressions and components out of the filtered sets", () => {
    const source = dedent`
      ---
      const plain = "ignore";
      ---

      <p>{plain}</p>
      <LocalTrans>Read the docs.</LocalTrans>
    `;

    const result = createAstroTransformContext(source);

    expect(result.filteredExpressions).toHaveLength(0);
    expect(result.filteredComponents).toHaveLength(0);
    expect(result.usesAstroI18n).toBe(false);
    expect(result.usesRuntimeTrans).toBe(false);
  });
});

describe("getFrontmatterContent", () => {
  test("returns only the inner frontmatter content", () => {
    const source = dedent`
      ---
      const label = "hello";
      ---

      <p>{label}</p>
    `;
    const context = createAstroTransformContext(source);

    expect(getFrontmatterContent(source, context.analysis).trim()).toBe(
      'const label = "hello";',
    );
  });

  test("returns an empty string when no frontmatter exists", () => {
    const source = "<p>Hello</p>";
    const context = createAstroTransformContext(source);

    expect(getFrontmatterContent(source, context.analysis)).toBe("");
  });

  test("returns correct content when frontmatter contains non-ASCII characters", () => {
    // The WASM analyzer returns UTF-8 byte offsets. Non-ASCII characters like
    // the em dash (U+2014, 3 UTF-8 bytes, 1 JS char) cause a drift between
    // byte positions and JS string character positions. The content range must
    // not overshoot into the closing --- fence.
    const source = [
      "---",
      "// Note: résumé — keep this comment",
      'const label = "hello";',
      "---",
      "",
      "<p>{label}</p>",
    ].join("\n");
    const context = createAstroTransformContext(source);

    const content = getFrontmatterContent(source, context.analysis);
    expect(content).not.toContain("---");
    expect(content.trim()).toBe(
      '// Note: résumé — keep this comment\nconst label = "hello";',
    );
  });
});

describe("createAstroPlan – non-ASCII sources", () => {
  test("correctly slices expression source after multi-byte frontmatter characters", () => {
    // If WASM byte offsets were used directly as JS string char offsets, the
    // expression source would be sliced from the wrong position after any
    // multi-byte character earlier in the file.
    const source = [
      "---",
      "// résumé — frontmatter comment with multibyte chars",
      'import { t } from "lingui-for-astro/macro";',
      "---",
      "",
      "<p>{t`Hello`}</p>",
    ].join("\n");

    const plan = createAstroPlan(source, { filename: "/virtual/Page.astro" });

    const expr = plan.items.find((i) => i.kind === "template-expression");
    expect(expr).toBeDefined();
    // The plan item's source and innerRange are char-based after the fix, so
    // the source string and the slice of the original source both give the
    // correct expression text.
    expect(expr!.source).toBe("t`Hello`");
    expect(
      source.slice(
        (expr as Extract<typeof expr, { kind: "template-expression" }>)!
          .innerRange.start,
        (expr as Extract<typeof expr, { kind: "template-expression" }>)!
          .innerRange.end,
      ),
    ).toBe("t`Hello`");
  });
});
