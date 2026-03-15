import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  createAstroExtractionUnits,
  normalizeLinguiConfig,
} from "../compiler-core/index.ts";

function createExtractorContext(ctx: ExtractorCtx | undefined): ExtractorCtx {
  if (ctx) {
    return ctx;
  }

  return {
    linguiConfig: normalizeLinguiConfig(),
  };
}

function getParserPlugins(
  ctx: ExtractorCtx,
): NonNullable<ParserOptions["plugins"]> {
  const parserOptions = ctx.linguiConfig.extractorParserOptions;

  return [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
    "typescript",
    "jsx",
    parserOptions?.tsExperimentalDecorators
      ? "decorators-legacy"
      : "decorators",
  ];
}

export const astroExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".astro");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx);
    const units = await createAstroExtractionUnits(source, {
      filename,
      linguiConfig: extractorCtx.linguiConfig,
    });

    for (const unit of units) {
      await extractFromFileWithBabel(
        filename,
        unit.code,
        onMessageExtracted,
        unit.map
          ? {
              ...extractorCtx,
              sourceMaps: unit.map,
            }
          : extractorCtx,
        {
          plugins: getParserPlugins(extractorCtx),
        },
        true,
      );
    }
  },
};
