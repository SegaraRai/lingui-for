import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { lowerSvelteExtractProgram } from "./extract.ts";

describe("lowerSvelteExtractProgram", () => {
  test("runs the official Lingui transform for extracted JavaScript macros", () => {
    const result = lowerSvelteExtractProgram(
      dedent`
        import { t } from "@lingui/core/macro";

        const label = t\`Hello \${name}\`;
      `,
      {
        filename: "/virtual/file.ts",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
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

  test("keeps extraction output in Lingui-friendly form", () => {
    const result = lowerSvelteExtractProgram(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(t({ id: "demo.save", message: "Save" }), "t");
      `,
      {
        filename: "/virtual/App.instance.ts",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
      },
    );

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("_i18n._(");
    expect(result.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const __lingui_for_svelte_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "demo.save",
        message: "Save"
      });"
    `);
  });
});
