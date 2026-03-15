import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  createExtractionUnits,
  normalizeLinguiConfig,
  type LinguiSvelteTransformOptions,
} from "../compiler-core/index.ts";

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

async function runExtractionUnits(
  filename: string,
  units: ReturnType<typeof createExtractionUnits>,
  onMessageExtracted: Parameters<ExtractorType["extract"]>[2],
  ctx: ExtractorCtx,
): Promise<void> {
  for (const unit of units) {
    await extractFromFileWithBabel(
      filename,
      unit.code,
      onMessageExtracted,
      unit.map
        ? {
            ...ctx,
            sourceMaps: unit.map,
          }
        : ctx,
      {
        plugins: getParserPlugins(ctx),
      },
      true,
    );
  }
}

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: LinguiSvelteTransformOptions,
): ExtractorCtx {
  if (ctx) {
    return ctx;
  }

  return {
    linguiConfig: normalizeLinguiConfig(options?.linguiConfig),
  };
}

/**
 * Lingui extractor implementation for `.svelte` files.
 *
 * The extractor accepts Svelte source, converts it into one or more extraction units via the
 * compiler core, and forwards each unit to Lingui's Babel-based extractor together with the
 * corresponding source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
 */
export const svelteExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".svelte");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx, {
      filename,
      linguiConfig: ctx?.linguiConfig,
    });
    const units = createExtractionUnits(source, {
      filename,
      linguiConfig: extractorCtx.linguiConfig,
    });

    await runExtractionUnits(filename, units, onMessageExtracted, extractorCtx);
  },
};
