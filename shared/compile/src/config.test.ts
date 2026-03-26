import { describe, expect, test } from "vite-plus/test";

import { getParserPlugins, normalizeLinguiConfig } from "./config.ts";

describe("config helpers", () => {
  test("normalizes macro packages and runtime bindings", () => {
    const config = normalizeLinguiConfig(
      {
        macro: {
          corePackage: ["custom-core"],
          jsxPackage: ["custom-jsx"],
        },
        runtimeConfigModule: {
          i18n: ["custom-runtime", "i18n"],
        },
      },
      {
        macroPackage: "lingui-for-test/macro",
        runtimePackage: "lingui-for-test/runtime",
      },
    );
    const macro = config.macro!;

    expect(macro.corePackage).toEqual([
      "lingui-for-test/macro",
      "@lingui/macro",
      "@lingui/core/macro",
      "custom-core",
    ]);
    expect(macro.jsxPackage).toEqual([
      "lingui-for-test/macro",
      "@lingui/macro",
      "@lingui/react/macro",
      "custom-jsx",
    ]);
    expect(config.runtimeConfigModule).toEqual({
      i18n: ["custom-runtime", "i18n"],
      Trans: ["lingui-for-test/runtime", "RuntimeTrans"],
    });
  });

  test("returns parser plugins with optional typescript support", () => {
    expect(getParserPlugins()).toEqual([
      "importAttributes",
      "explicitResourceManagement",
      "decoratorAutoAccessors",
      "deferredImportEvaluation",
      "jsx",
    ]);
    expect(getParserPlugins({ typescript: true })).toEqual([
      "importAttributes",
      "explicitResourceManagement",
      "decoratorAutoAccessors",
      "deferredImportEvaluation",
      "typescript",
      "jsx",
    ]);
  });
});
