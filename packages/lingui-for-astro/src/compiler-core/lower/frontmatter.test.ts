import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import {
  buildFrontmatterPrelude,
  lowerFrontmatterMacros,
} from "./frontmatter.ts";

describe("lower/frontmatter", () => {
  it("builds frontmatter preludes and lowers runtime frontmatter macros", () => {
    expect(buildFrontmatterPrelude(true, true)).toContain("getLinguiContext");

    const lowered = lowerFrontmatterMacros(
      dedent`
        import { t } from "lingui-for-astro/macro";
        const label = t\`Welcome\`;
      `,
      { filename: "/virtual/Page.astro" },
      { extract: false },
    );

    expect(lowered.code).toContain("__l4a_i18n._(");
    expect(lowered.code).not.toContain('from "lingui-for-astro/macro"');
  });
});
