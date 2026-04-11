import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  transformSync,
  type PluginItem,
} from "@lingui-for/framework-core/vendor/babel-core";

import { createAstroMacroPostprocessPlugin } from "./macro-rewrite.ts";

function runWithPlugin(
  code: string,
  plugin: PluginItem,
  filename = "/virtual/Page.astro?frontmatter",
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
    throw new Error("Failed to transform Astro macro rewrite fixture");
  }

  return result.code;
}

describe("createAstroMacroPostprocessPlugin", () => {
  test("rewrites runtime i18n calls to the Astro context binding and removes the i18n import", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n, setupI18n } from "@lingui/core";

        const label = runtimeI18n._({
          id: "demo.save",
          message: "Save"
        });

        setupI18n();
      `,
      createAstroMacroPostprocessPlugin({
        translationMode: "contextual",
        runtimeBinding: "__l4a_i18n",
      }),
    );

    expect(code).toMatchInlineSnapshot(`
      "import { setupI18n } from "@lingui/core";
      const label = __l4a_i18n._({
        id: "demo.save",
        message: "Save"
      });
      setupI18n();"
    `);
  });

  test("leaves extract-mode Lingui runtime calls untouched", () => {
    const code = runWithPlugin(
      dedent`
        import { i18n as runtimeI18n } from "@lingui/core";

        const label = runtimeI18n._({
          id: "demo.save",
          message: "Save"
        });
      `,
      createAstroMacroPostprocessPlugin({
        translationMode: "extract",
      }),
    );

    expect(code).toMatchInlineSnapshot(`
      "import { i18n as runtimeI18n } from "@lingui/core";
      const label = runtimeI18n._({
        id: "demo.save",
        message: "Save"
      });"
    `);
  });
});
