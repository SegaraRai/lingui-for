import dedent from "dedent";
import { describe, expect, it } from "vitest";

import {
  createAstroTransformContext,
  getFrontmatterContent,
} from "./astro-transform-context.ts";

describe("createAstroTransformContext", () => {
  it("collects frontmatter, macro bindings, and macro-bearing nodes", () => {
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

  it("keeps non-macro expressions and components out of the filtered sets", () => {
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
  it("returns only the inner frontmatter content", () => {
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

  it("returns an empty string when no frontmatter exists", () => {
    const source = "<p>Hello</p>";
    const context = createAstroTransformContext(source);

    expect(getFrontmatterContent(source, context.analysis)).toBe("");
  });
});
