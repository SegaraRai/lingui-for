import type {
  ExtractorCtx,
  ExtractorType,
  LinguiConfigNormalized,
} from "@lingui/conf";

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
import { createAstroFrameworkConventions } from "../common/conventions.ts";
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

/**
 * Options for {@link astroExtractor}.
 */
export interface AstroExtractorOptions {
  /**
   * Additional package specifiers that should be treated like `lingui-for-astro/macro` when
   * normalizing the Lingui configuration for synthetic modules.
   */
  astroPackages?: readonly string[] | undefined;
  /**
   * Whitespace handling mode for rich-text Component Macros during extraction.
   *
   * Keep this aligned with the transform-time `whitespace` setting so extracted messages match the
   * compiled output.
   *
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros
   */
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
  const { astroPackages, whitespace = "auto" } = options ?? {};
  const resolvedWhitespace = resolveAstroWhitespace(whitespace);

  return {
    match(filename) {
      return filename.endsWith(".astro");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const extractorCtx = createExtractorContext(ctx, { astroPackages });
      const syntheticName = filename.replace(/\.astro$/, ".synthetic.tsx");
      const synthetic = buildSyntheticModule({
        source,
        sourceName: filename,
        syntheticName,
        whitespace: resolvedWhitespace,
        conventions: createAstroFrameworkConventions(
          extractorCtx.linguiConfig,
          {
            astroPackages,
          },
        ),
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

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: {
    astroPackages?: readonly string[] | undefined;
  },
): ExtractorCtx & { linguiConfig: LinguiConfigNormalized } {
  const linguiConfig = normalizeLinguiConfig(ctx?.linguiConfig, options);
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
