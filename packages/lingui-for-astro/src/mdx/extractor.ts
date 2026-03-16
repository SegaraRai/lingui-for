import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";
import { createMdxExtractionUnits } from "./transform.ts";

function createExtractorContext(ctx: ExtractorCtx | undefined): ExtractorCtx {
  if (ctx) {
    return {
      ...ctx,
      linguiConfig: normalizeLinguiConfig(ctx.linguiConfig),
    };
  }

  return {
    linguiConfig: normalizeLinguiConfig(),
  };
}

/**
 * Lingui extractor for `.mdx` source files.
 *
 * It matches MDX files, lowers rendered Lingui macros into Babel-extractable
 * units, and forwards the resulting messages to Lingui's Babel extractor
 * pipeline. Keep extractor registration aligned with runtime transforms:
 * add or remove the MDX unplugin, or update the integration's `mdx` option,
 * at the same time you add or remove this extractor.
 */
export const mdxExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".mdx");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx);
    const units = await createMdxExtractionUnits(source, {
      filename,
      linguiConfig: extractorCtx.linguiConfig,
    });

    for (const unit of units) {
      await extractFromFileWithBabel(
        filename,
        unit.code,
        onMessageExtracted,
        extractorCtx,
        {
          plugins: getParserPlugins(extractorCtx),
        },
        true,
      );
    }
  },
};

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
