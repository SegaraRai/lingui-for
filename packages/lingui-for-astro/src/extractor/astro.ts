import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  buildSyntheticModule,
  type SyntheticModule,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import { stripQuery } from "@lingui-for/internal-shared-common";
import {
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  toBabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import { transformProgram } from "../compiler-core/lower/babel-transform.ts";
import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";

function createExtractorContext(ctx: ExtractorCtx | undefined): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(ctx?.linguiConfig);
  return { ...ctx, linguiConfig };
}

function normalizeExtractionSourceMap(
  map: CanonicalSourceMap,
): CanonicalSourceMap {
  return {
    ...map,
    file: map.file ? stripQuery(map.file) : map.file,
    sources: (map.sources as string[] | undefined)?.map(stripQuery) ?? [],
  };
}

async function buildSyntheticExtractionUnit(
  filename: string,
  source: string,
  whitespace: "jsx" | "astro" | "svelte",
): Promise<SyntheticModule> {
  return buildSyntheticModule({
    framework: "astro",
    source,
    sourceName: filename,
    syntheticName: filename.replace(/\.astro$/, ".synthetic.tsx"),
    whitespace,
  });
}

export interface AstroExtractorOptions {
  whitespace?: "jsx" | "auto" | "astro" | "svelte";
}

/**
 * Lingui extractor factory for `.astro` source files.
 *
 * It matches Astro files, lowers macro-bearing syntax into a Rust-generated
 * synthetic module, and forwards the extracted messages to Lingui's Babel
 * extractor pipeline.
 */
export function astroExtractor(options?: AstroExtractorOptions): ExtractorType {
  const whitespace =
    options?.whitespace == null || options.whitespace === "auto"
      ? "astro"
      : options.whitespace;

  return {
    match(filename) {
      return filename.endsWith(".astro");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const extractorCtx = createExtractorContext(ctx);
      const synthetic = await buildSyntheticExtractionUnit(
        filename,
        source,
        whitespace,
      );
      const transformed = transformProgram(synthetic.source, {
        translationMode: "extract",
        filename: filename.replace(/\.astro$/, ".synthetic.tsx"),
        linguiConfig: extractorCtx.linguiConfig,
        runtimeBinding: null,
        inputSourceMap: toBabelSourceMap(
          parseCanonicalSourceMap(synthetic.sourceMapJson),
        ),
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
}
