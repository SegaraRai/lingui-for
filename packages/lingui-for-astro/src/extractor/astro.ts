import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import { stripQuery } from "@lingui-for/internal-shared-common";
import { runBabelExtractionUnits } from "@lingui-for/internal-shared-compile";

import { transformProgram } from "../compiler-core/lower/babel-transform.ts";
import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";

type SyntheticExtractionUnit = {
  source: string;
  source_map_json?: string | null;
};

function createExtractorContext(ctx: ExtractorCtx | undefined): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(ctx?.linguiConfig);
  return ctx ? { ...ctx, linguiConfig } : { linguiConfig };
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
    sources: (map.sources as string[] | undefined)?.map(stripQuery) ?? [],
  };
}

async function buildSyntheticExtractionUnit(
  filename: string,
  source: string,
): Promise<SyntheticExtractionUnit> {
  const { buildSyntheticModuleWithOptions } =
    await import("@lingui-for/internal-lingui-analyzer-wasm");

  return buildSyntheticModuleWithOptions({
    framework: "astro",
    source,
    source_name: filename,
    synthetic_name: filename.replace(/\.astro$/, ".synthetic.tsx"),
  }) as SyntheticExtractionUnit;
}

/**
 * Lingui extractor for `.astro` source files.
 *
 * It matches Astro files, lowers macro-bearing syntax into a Rust-generated
 * synthetic module, and forwards the extracted messages to Lingui's Babel
 * extractor pipeline.
 */
export const astroExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".astro");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx);
    const synthetic = await buildSyntheticExtractionUnit(filename, source);
    const transformed = transformProgram(synthetic.source, {
      translationMode: "extract",
      filename: filename.replace(/\.astro$/, ".synthetic.tsx"),
      linguiConfig: extractorCtx.linguiConfig,
      runtimeBinding: null,
      inputSourceMap: synthetic.source_map_json
        ? JSON.parse(synthetic.source_map_json)
        : null,
    });

    await runBabelExtractionUnits(
      filename,
      [
        {
          code: transformed.code,
          map: transformed.map ?? undefined,
        },
      ],
      onMessageExtracted,
      extractorCtx,
      {
        normalizeSourceMap: normalizeExtractionSourceMap,
      },
    );
  },
};
