import type { ExtractorCtx } from "@lingui/conf";
import { describe, expect, test, vi } from "vite-plus/test";

import {
  getLinguiExtractorParserPlugins,
  runBabelExtractionUnits,
} from "./extractor.ts";

const extractFromFileWithBabelMock = vi.hoisted(() => vi.fn());

vi.mock("@lingui/cli/api", () => ({
  extractFromFileWithBabel: extractFromFileWithBabelMock,
}));

function createExtractorContext(): ExtractorCtx {
  return {
    linguiConfig: {
      extractorParserOptions: {
        tsExperimentalDecorators: true,
      },
    },
  } as ExtractorCtx;
}

describe("extractor helpers", () => {
  test("builds extractor parser plugins from Lingui config", () => {
    expect(getLinguiExtractorParserPlugins(createExtractorContext())).toEqual([
      "importAttributes",
      "explicitResourceManagement",
      "decoratorAutoAccessors",
      "deferredImportEvaluation",
      "typescript",
      "jsx",
      "decorators-legacy",
    ]);
  });

  test("forwards extraction units and normalized source maps to Lingui", async () => {
    extractFromFileWithBabelMock.mockResolvedValue(undefined);
    const onMessageExtracted = vi.fn();
    const ctx = createExtractorContext();

    await runBabelExtractionUnits(
      "/virtual/example.tsx",
      [
        {
          code: "/*i18n*/ const a = 1;",
        },
        {
          code: "/*i18n*/ const b = 2;",
          map: {
            version: 3,
            file: "/virtual/example.tsx?query",
            names: [],
            mappings: "",
            sources: ["/virtual/example.tsx?query"],
            sourcesContent: ["const b = 2;"],
          },
        },
      ],
      onMessageExtracted,
      ctx,
      {
        normalizeSourceMap(map) {
          return {
            ...map,
            file: "/virtual/example.tsx",
          };
        },
      },
    );

    expect(extractFromFileWithBabelMock).toHaveBeenCalledTimes(2);
    expect(extractFromFileWithBabelMock).toHaveBeenNthCalledWith(
      1,
      "/virtual/example.tsx",
      "/*i18n*/ const a = 1;",
      onMessageExtracted,
      ctx,
      {
        plugins: getLinguiExtractorParserPlugins(ctx),
      },
      true,
    );
    expect(extractFromFileWithBabelMock).toHaveBeenNthCalledWith(
      2,
      "/virtual/example.tsx",
      "/*i18n*/ const b = 2;",
      onMessageExtracted,
      {
        ...ctx,
        sourceMaps: {
          version: 3,
          file: "/virtual/example.tsx",
          names: [],
          mappings: "",
          sources: ["/virtual/example.tsx?query"],
          sourcesContent: ["const b = 2;"],
        },
      },
      {
        plugins: getLinguiExtractorParserPlugins(ctx),
      },
      true,
    );
  });
});
