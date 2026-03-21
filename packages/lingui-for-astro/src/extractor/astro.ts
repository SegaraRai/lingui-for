import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  runBabelExtractionUnits,
  stripQuery,
} from "lingui-for-shared/compiler";

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

function normalizeExtractionSourceMap(
  map: ExtractorCtx["sourceMaps"],
): ExtractorCtx["sourceMaps"] {
  if (!map) {
    return map;
  }

  return {
    ...map,
    file: map.file ? stripQuery(map.file) : map.file,
    sources: map.sources.map(stripQuery),
  };
}

/**
 * Lingui extractor for `.astro` source files.
 *
 * It matches Astro files, lowers macro-bearing expressions and component
 * macros into Babel-extractable units, and forwards the extracted messages to
 * Lingui's Babel extractor pipeline.
 */
export const astroExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".astro");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx);
    const units = createAstroExtractionUnits(source, {
      filename,
      linguiConfig: extractorCtx.linguiConfig,
    });

    await runBabelExtractionUnits(
      filename,
      units,
      onMessageExtracted,
      extractorCtx,
      {
        normalizeSourceMap: normalizeExtractionSourceMap,
      },
    );
  },
};
