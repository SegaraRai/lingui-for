import { transformSync, type PluginItem } from "@babel/core";
import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";
import type { ProgramTransformRequest } from "./types.ts";

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

function createRequest(
  overrides: Partial<ProgramTransformRequest> = {},
): ProgramTransformRequest {
  return {
    extract: false,
    filename: "/virtual/file.ts",
    lang: "ts",
    linguiConfig: normalizeLinguiConfig(),
    translationMode: "raw",
    ...overrides,
  };
}

describe("createMacroPreprocessPlugin", () => {
  it("wraps reactive $-prefixed string macros when they are imported from the macro package", () => {
    const code = runWithPlugin(
      dedent`
        import { t as translate, plural } from "lingui-for-svelte/macro";

        const label = $translate\`Hello \${name}\`;
        const books = $plural(count, { one: "# Book", other: "# Books" });
      `,
      createMacroPreprocessPlugin(),
    );

    expect(code).toMatchInlineSnapshot(`
      "import { t as translate, plural } from "lingui-for-svelte/macro";
      const label = __lingui_for_svelte_reactive_translation__(translate\`Hello \${name}\`, "translate");
      const books = __lingui_for_svelte_reactive_translation__(plural(count, {
        one: "# Book",
        other: "# Books"
      }), "plural");"
    `);
  });

  it("does not rewrite $-prefixed calls without a Lingui macro import", () => {
    const code = runWithPlugin(
      "const label = $t`Hello ${name}`;",
      createMacroPreprocessPlugin(),
    );

    expect(code).toBe("const label = $t`Hello ${name}`;");
  });

  it("wraps explicit eager direct translations", () => {
    const code = runWithPlugin(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const label = t.eager\`Hello \${name}\`;
      `,
      createMacroPreprocessPlugin(),
    );

    expect(code).toMatchInlineSnapshot(`
      "import { t } from "lingui-for-svelte/macro";
      const label = __lingui_for_svelte_eager_translation__(t\`Hello \${name}\`);"
    `);
  });

  it("rejects bare direct t calls in strict Svelte mode", () => {
    expect(() =>
      runWithPlugin(
        dedent`
          import { t } from "lingui-for-svelte/macro";

          const label = t\`Hello\`;
        `,
        createMacroPreprocessPlugin(),
      ),
    ).toThrow(/Bare `t` in `.svelte` files is not allowed/);
  });
});

describe("createMacroPostprocessPlugin", () => {
  it("rewrites reactive wrappers to context-aware translator calls in svelte-context mode", () => {
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
      createMacroPostprocessPlugin(
        createRequest({
          translationMode: "svelte-context",
          runtimeBindings: {
            createLinguiAccessors: "createLinguiAccessors",
            context: "__l4s_ctx",
            getI18n: "__l4s_getI18n",
            translate: "__l4s_translate",
          },
        }),
      ),
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

  it("keeps top-level variable initializers as direct translator reads after lowering reactive wrappers", () => {
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
      createMacroPostprocessPlugin(
        createRequest({
          translationMode: "svelte-context",
          runtimeBindings: {
            createLinguiAccessors: "createLinguiAccessors",
            context: "__l4s_ctx",
            getI18n: "__l4s_getI18n",
            translate: "__l4s_translate",
          },
        }),
      ),
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

  it("unwraps reactive wrappers back to plain Lingui calls in extract mode", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";

        const label = __lingui_for_svelte_reactive_translation__(runtimeI18n._({
          id: "demo.heading",
          message: "Hello"
        }), "t");
      `,
      createMacroPostprocessPlugin(
        createRequest({
          extract: true,
          translationMode: "extract",
        }),
      ),
    );

    expect(code).toMatchInlineSnapshot(`
      "import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";
      const label = runtimeI18n._({
        id: "demo.heading",
        message: "Hello"
      });"
    `);
  });

  it("unwraps eager wrappers to direct translator calls", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "lingui-for-svelte/runtime";

        const label = __lingui_for_svelte_eager_translation__(runtimeI18n._({
          id: "demo.heading",
          message: "Hello"
        }));
      `,
      createMacroPostprocessPlugin(
        createRequest({
          translationMode: "svelte-context",
          runtimeBindings: {
            createLinguiAccessors: "createLinguiAccessors",
            context: "__l4s_ctx",
            getI18n: "__l4s_getI18n",
            translate: "__l4s_translate",
          },
        }),
      ),
    );

    expect(code).toMatchInlineSnapshot(`
      "const label = __l4s_getI18n()._({
        id: "demo.heading",
        message: "Hello"
      });"
    `);
  });
});
