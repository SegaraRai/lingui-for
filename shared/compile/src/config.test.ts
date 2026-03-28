import { describe, expect, test } from "vite-plus/test";

import { getParserPlugins } from "./config.ts";

describe("config helpers", () => {
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
