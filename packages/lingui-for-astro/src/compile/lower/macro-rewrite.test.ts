import { transformSync, type PluginItem } from "@babel/core";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { createAstroMacroPostprocessPlugin } from "./macro-rewrite.ts";
import type { ProgramTransformRequest } from "./types.ts";

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

function createRequest(
  overrides: Partial<ProgramTransformRequest> = {},
): ProgramTransformRequest {
  return {
    translationMode: "extract",
    filename: "/virtual/Page.astro?frontmatter",
    linguiConfig: normalizeLinguiConfig(),
    runtimeBinding: null,
    ...overrides,
  } as ProgramTransformRequest;
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
      createAstroMacroPostprocessPlugin(
        createRequest({
          translationMode: "astro-context",
          runtimeBinding: "__l4a_i18n",
        }),
      ),
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
      createAstroMacroPostprocessPlugin(createRequest()),
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
