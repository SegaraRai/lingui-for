import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  RUNTIME_BINDING_CREATE_FRONTMATTER_I18N,
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import {
  buildFrontmatterPrelude,
  lowerFrontmatterMacros,
} from "./frontmatter.ts";

describe("lower/frontmatter", () => {
  test("builds frontmatter preludes and lowers runtime frontmatter macros", () => {
    expect(
      buildFrontmatterPrelude(true, true, {
        createI18n: RUNTIME_BINDING_CREATE_FRONTMATTER_I18N,
        i18n: RUNTIME_BINDING_I18N,
        runtimeTrans: RUNTIME_BINDING_RUNTIME_TRANS,
      }),
    ).toContain("createFrontmatterI18n");

    const source = dedent`
      import { t } from "lingui-for-astro/macro";
      const label = t\`Welcome\`;
    `;
    const lowered = lowerFrontmatterMacros(
      source,
      { filename: "/virtual/Page.astro" },
      {
        extract: false,
        runtimeBinding: RUNTIME_BINDING_I18N,
        sourceMapOptions: { fullSource: source, sourceStart: 0 },
      },
    );

    expect(lowered.code).toContain("__l4a_i18n._(");
    expect(lowered.code).not.toContain('from "lingui-for-astro/macro"');
  });
});
