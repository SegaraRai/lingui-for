import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { lowerSvelteTransformPrograms } from "./transform.ts";

describe("lowerSvelteTransformPrograms", () => {
  test("produces lowered and contextual variants from one compile-oriented entry point", () => {
    const result = lowerSvelteTransformPrograms(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(t\`Hello \${name}\`, "t");
      `,
      {
        loweredFilename: "/virtual/App.instance.ts?lowered",
        contextualFilename: "/virtual/App.instance.ts?contextual",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
        },
      },
    );

    expect(result.lowered.code).toContain(
      "__lingui_for_svelte_reactive_translation__(",
    );
    expect(result.contextual.code).toContain("$__l4s_translate(");
    expect(result.contextual.code).not.toContain("$derived(");
    expect(result.lowered.filename).toBe("/virtual/App.instance.ts?lowered");
    expect(result.contextual.filename).toBe(
      "/virtual/App.instance.ts?contextual",
    );
    expect(result.contextual.code).toMatchInlineSnapshot(`
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

  test("keeps reactive wrappers in lowered mode without synthesizing runtime t imports", () => {
    const result = lowerSvelteTransformPrograms(
      dedent`
        import { select, t as translate } from "@lingui/core/macro";

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(translate\`Hello \${name}\`, "translate");
        const __lingui_for_svelte_expr_1 = __lingui_for_svelte_reactive_translation__(select(locale, {
          en: "English",
          other: "Other",
        }), "select");
      `,
      {
        loweredFilename: "/virtual/App.instance.ts?lowered",
        contextualFilename: "/virtual/App.instance.ts?contextual",
        lang: "ts",
        linguiConfig: normalizeLinguiConfig(),
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
        },
      },
    );

    expect(result.lowered.code).toContain(
      "__lingui_for_svelte_reactive_translation__(",
    );
    expect(result.lowered.code).not.toContain(
      'from "lingui-for-svelte/runtime"',
    );
    expect(result.lowered.code).not.toContain("t as translate");
    expect(result.lowered.code).not.toContain("t as select");
  });
});
