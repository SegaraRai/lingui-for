import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ExtractorCtx, ExtractorType } from "@lingui/conf";
import {
  buildSyntheticModuleWithOptions,
  initSync,
} from "lingui-analyzer-wasm";

import {
  runBabelExtractionUnits,
  stripQuery,
} from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";

type SyntheticExtractionUnit = {
  source: string;
  source_map_json?: string | null;
};

let wasmInitialized = false;

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

function ensureWasmInitialized(): void {
  if (wasmInitialized) {
    return;
  }

  const wasmPath = fileURLToPath(
    import.meta.resolve("lingui-analyzer-wasm/wasm"),
  );
  initSync({ module: readFileSync(wasmPath) });
  wasmInitialized = true;
}

function buildSyntheticExtractionUnit(
  filename: string,
  source: string,
): SyntheticExtractionUnit {
  ensureWasmInitialized();
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
    const synthetic = buildSyntheticExtractionUnit(filename, source);

    await runBabelExtractionUnits(
      filename,
      [
        {
          code: synthetic.source,
          map: synthetic.source_map_json
            ? (JSON.parse(synthetic.source_map_json) as NonNullable<
                ExtractorCtx["sourceMaps"]
              >)
            : undefined,
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
