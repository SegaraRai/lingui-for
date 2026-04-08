import { transformSync, type PluginItem } from "@babel/core";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createSvelteMacroPostprocessPlugin } from "./macro-rewrite.ts";

function runWithPlugin(
  code: string,
  plugin: PluginItem,
  filename = "/virtual/file.ts",
): string {
  const result = transformSync(code, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    filename,
    parserOpts: {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    },
    plugins: [plugin],
  });

  if (result?.code == null) {
    throw new Error("Failed to transform macro rewrite fixture");
  }

  return result.code;
}

describe("createMacroPostprocessPlugin", () => {
  test("rewrites reactive wrappers to context-aware translator calls in contextual mode", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";

        const eager = runtimeI18n._({
          id: "demo.save",
          message: "Save"
        });

        const label = __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "demo.heading",
          message: "Hello"
        }), "t");

        const __lingui_for_svelte_expr_0 = __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "demo.inline",
          message: "Inline"
        }), "t");
      `,
      createSvelteMacroPostprocessPlugin({
        translationMode: "contextual",
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
          reactiveTranslationWrapper:
            "__lingui_for_svelte_reactive_translation__",
          eagerTranslationWrapper: "__lingui_for_svelte_eager_translation__",
        },
      }),
    );

    expect(code).toMatchInlineSnapshot(`
      "const eager = __l4s_getI18n()._({
        id: "demo.save",
        message: "Save"
      });
      const label = $__l4s_translate({
        id: "demo.heading",
        message: "Hello"
      });
      const __lingui_for_svelte_expr_0 = $__l4s_translate({
        id: "demo.inline",
        message: "Inline"
      });"
    `);
  });

  test("keeps top-level variable initializers as direct translator reads after lowering reactive wrappers", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";

        const label = {
          idle: __lingui_for_svelte_reactive_translation__(runtimeI18n._({
            id: "idle",
            message: "idle"
          }), "t")
        };

        const getStatusText = () => __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "active",
          message: "active"
        }), "t");
      `,
      createSvelteMacroPostprocessPlugin({
        translationMode: "contextual",
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
          reactiveTranslationWrapper:
            "__lingui_for_svelte_reactive_translation__",
          eagerTranslationWrapper: "__lingui_for_svelte_eager_translation__",
        },
      }),
    );

    expect(code).toMatchInlineSnapshot(`
      "const label = {
        idle: $__l4s_translate({
          id: "idle",
          message: "idle"
        })
      };
      const getStatusText = () => $__l4s_translate({
        id: "active",
        message: "active"
      });"
    `);
  });

  test("unwraps reactive wrappers back to plain Lingui calls in extract mode", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";

        const label = __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "demo.heading",
          message: "Hello"
        }), "t");
      `,
      createSvelteMacroPostprocessPlugin({
        translationMode: "extract",
        wrapperBindings: {
          reactiveTranslationWrapper:
            "__lingui_for_svelte_reactive_translation__",
          eagerTranslationWrapper: "__lingui_for_svelte_eager_translation__",
        },
      }),
    );

    expect(code).toMatchInlineSnapshot(`
      "import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";
      const label = runtimeI18n._({
        id: "demo.heading",
        message: "Hello"
      });"
    `);
  });

  test("keeps reactive wrappers intact in lowered mode without inventing runtime t imports", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "@lingui/core";

        const greeting = __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "demo.heading",
          message: "Hello"
        }), "translate");

        const choice = __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "demo.choice",
          message: "{locale, select, en {English} other {Other}}",
          values: {
            locale
          }
        }), "select");
      `,
      createSvelteMacroPostprocessPlugin({
        translationMode: "lowered",
        wrapperBindings: {
          reactiveTranslationWrapper:
            "__lingui_for_svelte_reactive_translation__",
          eagerTranslationWrapper: "__lingui_for_svelte_eager_translation__",
        },
      }),
    );

    expect(code).toContain("__lingui_for_svelte_reactive_translation__(");
    expect(code).not.toContain('from "lingui-for-svelte/runtime"');
    expect(code).not.toContain("t as translate");
    expect(code).not.toContain("t as select");
  });

  test("unwraps eager wrappers to direct translator calls", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";

        const label = __lingui_for_svelte_eager_translation__(runtimeI18n._({
          id: "demo.heading",
          message: "Hello"
        }));
      `,
      createSvelteMacroPostprocessPlugin({
        translationMode: "contextual",
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
          reactiveTranslationWrapper:
            "__lingui_for_svelte_reactive_translation__",
          eagerTranslationWrapper: "__lingui_for_svelte_eager_translation__",
        },
      }),
    );

    expect(code).toMatchInlineSnapshot(`
      "const label = __l4s_getI18n()._({
        id: "demo.heading",
        message: "Hello"
      });"
    `);
  });
});
