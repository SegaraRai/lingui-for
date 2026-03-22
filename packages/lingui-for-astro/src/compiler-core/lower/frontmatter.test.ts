import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createAstroPlan } from "../plan/index.ts";
import {
  RUNTIME_BINDING_CREATE_FRONTMATTER_I18N,
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import {
  buildFrontmatterPrelude,
  buildFrontmatterTransformChunks,
} from "./frontmatter.ts";

describe("lower/frontmatter", () => {
  test("builds frontmatter preludes and frontmatter transform chunks", () => {
    expect(
      buildFrontmatterPrelude(true, true, {
        createI18n: RUNTIME_BINDING_CREATE_FRONTMATTER_I18N,
        i18n: RUNTIME_BINDING_I18N,
        runtimeTrans: RUNTIME_BINDING_RUNTIME_TRANS,
      }),
    ).toContain("createFrontmatterI18n");

    const source = dedent`
      ---
      import { t } from "lingui-for-astro/macro";
      const label = t\`Welcome\`;
      ---
    `;
    const plan = createAstroPlan(source, {
      filename: "/virtual/Page.astro",
    });

    const chunks = buildFrontmatterTransformChunks(
      plan.frontmatter!.content,
      0,
      plan.frontmatter!.macroImportRanges,
      plan.frontmatter!.macroExpressionRanges,
      { filename: "/virtual/Page.astro" },
      { runtimeBinding: RUNTIME_BINDING_I18N },
    );

    expect(chunks).toEqual([
      expect.objectContaining({ code: "" }),
      expect.objectContaining({
        code: expect.stringContaining("__l4a_i18n._("),
      }),
    ]);
  });
});
