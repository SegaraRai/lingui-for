import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import {
  buildFrontmatterPrelude,
  transformFrontmatter,
} from "./frontmatter.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("transform/frontmatter", () => {
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
      }).code,
    );

    expect(code).not.toContain('from "lingui-for-astro/macro"');
    expect(code).toContain("const label = __l4a_i18n._(");
  });
});
