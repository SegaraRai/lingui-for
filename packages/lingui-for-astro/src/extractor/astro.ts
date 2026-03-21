import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  isIndexedSourceMap,
  runBabelExtractionUnits,
  stripQuery,
  type SourceMap,
} from "lingui-for-shared/compiler";

import { createAstroExtractionUnits } from "../compiler-core/extract/index.ts";
import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";

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

  const normalizedMap: SourceMap = map;

  if (isIndexedSourceMap(normalizedMap)) {
    return {
      ...normalizedMap,
      file: normalizedMap.file
        ? stripQuery(normalizedMap.file)
        : normalizedMap.file,
      sections: normalizedMap.sections.map((section) => ({
        ...section,
        map: normalizeExtractionSourceMap(section.map) ?? section.map,
      })),
    };
  }

  return {
    ...normalizedMap,
    file: normalizedMap.file
      ? stripQuery(normalizedMap.file)
      : normalizedMap.file,
    sources: normalizedMap.sources.map(stripQuery),
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
