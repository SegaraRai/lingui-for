import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { transformProgram } from "./babel-transform.ts";

describe("transformProgram", () => {
  test("rewrites runtime i18n access to the Astro context binding in astro-context mode", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const label = t\`Hello \${name}\`;
      `,
      {
        translationMode: "astro-context",
        filename: "/virtual/Page.astro?frontmatter",
        linguiConfig: normalizeLinguiConfig(),
        runtimeBinding: "__l4a_i18n",
        inputSourceMap: null,
      },
    );

    expect(result.code).toContain("__l4a_i18n._(");
    expect(result.code).not.toContain(
      'import { i18n as _i18n } from "@lingui/core";',
    );
  });

  test("keeps extraction output in Lingui-friendly form", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const __lingui_for_astro_expr_0 = t({ id: "demo.save", message: "Save" });
      `,
      {
        translationMode: "extract",
        filename: "/virtual/Page.astro?extract-expression",
        linguiConfig: normalizeLinguiConfig(),
        runtimeBinding: null,
        inputSourceMap: null,
      },
    );

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("_i18n._(");
  });
});
