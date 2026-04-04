import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { lowerAstroTransformProgram } from "./transform.ts";

describe("lowerAstroTransformProgram", () => {
  test("rewrites runtime i18n access to the Astro context binding in astro-context mode", () => {
    const result = lowerAstroTransformProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const label = t\`Hello \${name}\`;
      `,
      {
        filename: "/virtual/Page.astro?frontmatter",
        linguiConfig: normalizeLinguiConfig(),
        runtimeBinding: "__l4a_i18n",
      },
    );

    expect(result.code).toContain("__l4a_i18n._(");
    expect(result.code).not.toContain(
      'import { i18n as _i18n } from "@lingui/core";',
    );
  });
});
