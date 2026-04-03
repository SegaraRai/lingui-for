import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { transformProgram } from "./babel-transform.ts";

describe("transformProgram", () => {
  test("runs the official Lingui transform for raw JavaScript macros", () => {
    const result = transformProgram(
      dedent`
        import { t } from "@lingui/core/macro";

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

  test("lowers reactive wrappers to translator bindings in svelte-context mode", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(t\`Hello \${name}\`, "t");
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

  test("keeps reactive wrappers in raw mode without synthesizing runtime t imports", () => {
    const result = transformProgram(
      dedent`
        import { select, t as translate } from "@lingui/core/macro";

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(translate\`Hello \${name}\`, "translate");
        const __lingui_for_svelte_expr_1 = __lingui_for_svelte_reactive_translation__(select(locale, {
          en: "English",
          other: "Other",
        }), "select");
      `,
      {
        extract: false,
        filename: "/virtual/App.instance.ts",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
        translationMode: "raw",
      },
    );

    expect(result.code).toContain(
      "__lingui_for_svelte_reactive_translation__(",
    );
    expect(result.code).not.toContain('from "lingui-for-svelte/runtime"');
    expect(result.code).not.toContain("t as translate");
    expect(result.code).not.toContain("t as select");
  });

  test("keeps extraction output in Lingui-friendly form", () => {
    const result = transformProgram(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(t({ id: "demo.save", message: "Save" }), "t");
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
