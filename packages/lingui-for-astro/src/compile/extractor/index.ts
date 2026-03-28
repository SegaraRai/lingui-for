import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import { buildSyntheticModule } from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import { stripQuery } from "@lingui-for/internal-shared-common";
import {
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  toBabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  resolveAstroWhitespace,
  type RichTextWhitespaceMode,
} from "../common/config.ts";
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

export interface AstroExtractorOptions {
  whitespace?: RichTextWhitespaceMode | undefined;
}

/**
 * Lingui extractor factory for `.astro` source files.
 *
 * It matches Astro files, lowers macro-bearing syntax into a Rust-generated
 * synthetic module, and forwards the extracted messages to Lingui's Babel
 * extractor pipeline.
 */
export function astroExtractor(options?: AstroExtractorOptions): ExtractorType {
  const { whitespace = "auto" } = options ?? {};
  const resolvedWhitespace = resolveAstroWhitespace(whitespace);

  return {
    match(filename) {
      return filename.endsWith(".astro");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const extractorCtx = createExtractorContext(ctx);
      const syntheticName = filename.replace(/\.astro$/, ".synthetic.tsx");
      const synthetic = buildSyntheticModule({
        framework: "astro",
        source,
        sourceName: filename,
        syntheticName,
        whitespace: resolvedWhitespace,
      });
      const transformed = transformProgram(synthetic.source, {
        translationMode: "extract",
        filename: syntheticName,
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
            map: transformed.map,
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

function createExtractorContext(ctx: ExtractorCtx | undefined): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(ctx?.linguiConfig);
  return { ...ctx, linguiConfig };
}

function normalizeExtractionSourceMap(
  map: CanonicalSourceMap,
): CanonicalSourceMap {
  return {
    ...map,
    file: map.file != null ? stripQuery(map.file) : map.file,
    sources: (map.sources as string[] | undefined)?.map(stripQuery) ?? [],
  };
}
