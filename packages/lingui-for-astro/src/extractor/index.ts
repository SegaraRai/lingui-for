import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  createAstroExtractionUnits,
  isTransformableScript,
  normalizeLinguiConfig,
  transformJavaScriptMacros,
} from "../compiler-core/index.ts";
import { PACKAGE_MACRO_ALIASES } from "../compiler-core/shared/constants.ts";

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

export const jstsExtractor: ExtractorType = {
  match(filename) {
    return isTransformableScript(filename);
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx);

    if (
      PACKAGE_MACRO_ALIASES.some((packageName) => source.includes(packageName))
    ) {
      const transformed = transformJavaScriptMacros(
        source,
        {
          filename,
          linguiConfig: extractorCtx.linguiConfig,
        },
        true,
      );

      if (transformed) {
        await extractFromFileWithBabel(
          filename,
          transformed.code,
          onMessageExtracted,
          transformed.map
            ? {
                ...extractorCtx,
                sourceMaps: transformed.map,
              }
            : extractorCtx,
          {
            plugins: getParserPlugins(extractorCtx),
          },
          true,
        );
        return;
      }
    }

    await extractFromFileWithBabel(
      filename,
      source,
      onMessageExtracted,
      extractorCtx,
      {
        plugins: getParserPlugins(extractorCtx),
      },
      true,
    );
  },
};
