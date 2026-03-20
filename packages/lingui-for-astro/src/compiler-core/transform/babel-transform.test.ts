import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { transformProgram } from "./babel-transform.ts";

describe("transformProgram", () => {
  it("runs the official Lingui transform for raw JavaScript macros", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const label = t\`Hello \${name}\`;
      `,
      {
        extract: false,
        filename: "/virtual/file.ts",
        linguiConfig: normalizeLinguiConfig(),
        translationMode: "raw",
      },
    );

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("_i18n._(");
    expect(result.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const label = _i18n._(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      });"
    `);
  });

  it("rewrites runtime i18n access to the Astro context binding in astro-context mode", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const label = t\`Hello \${name}\`;
      `,
      {
        extract: false,
        filename: "/virtual/Page.astro?frontmatter",
        linguiConfig: normalizeLinguiConfig(),
        translationMode: "astro-context",
        runtimeBinding: "__l4a_i18n",
      },
    );

    expect(result.code).toContain("__l4a_i18n._(");
    expect(result.code).not.toContain(
      'import { i18n as _i18n } from "@lingui/core";',
    );
    expect(result.code).toMatchInlineSnapshot(`
      "const label = __l4a_i18n._(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      });"
    `);
  });

  it("keeps extraction output in Lingui-friendly form", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const __lingui_for_astro_expr_0 = t({ id: "demo.save", message: "Save" });
      `,
      {
        extract: true,
        filename: "/virtual/Page.astro?extract-expression",
        linguiConfig: normalizeLinguiConfig(),
        translationMode: "extract",
      },
    );

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("_i18n._(");
    expect(result.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const __lingui_for_astro_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "demo.save",
        message: "Save"
      });"
    `);
  });
});
