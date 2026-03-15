import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { transformProgram } from "./babel-transform.ts";

describe("transformProgram", () => {
  it("runs the official Lingui transform for raw JavaScript macros", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const label = t\`Hello \${name}\`;
      `,
      {
        extract: false,
        filename: "/virtual/file.ts",
        lang: "ts",
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

  it("lowers reactive wrappers to translator bindings in svelte-context mode", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_expr_0 = $t\`Hello \${name}\`;
      `,
      {
        extract: false,
        filename: "/virtual/App.instance.ts",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
        translationMode: "svelte-context",
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
        },
      },
    );

    expect(result.code).toContain("$__l4s_translate(");
    expect(result.code).not.toContain("$derived(");
    expect(result.code).toMatchInlineSnapshot(`
      "const __lingui_for_svelte_expr_0 = $__l4s_translate(
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
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_expr_0 = $t({ id: "demo.save", message: "Save" });
      `,
      {
        extract: true,
        filename: "/virtual/App.instance.ts",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
        translationMode: "extract",
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
