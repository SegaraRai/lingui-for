import type {
  ExtractorCtx,
  ExtractorType,
  LinguiConfigNormalized,
} from "@lingui/conf";

import { buildSyntheticModule } from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  toBabelSourceMap,
} from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  resolveSvelteWhitespace,
  type RichTextWhitespaceMode,
} from "../common/config.ts";
import { createSvelteFrameworkConventions } from "../common/conventions.ts";
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

export interface SvelteExtractorOptions {
  sveltePackages?: readonly string[] | undefined;
  whitespace?: RichTextWhitespaceMode | undefined;
}

/**
 * Lingui extractor implementation factory for `.svelte` files.
 *
 * The extractor accepts Svelte source, lowers it into a single Rust-generated synthetic module,
 * and forwards that module to Lingui's Babel-based extractor together with the corresponding
 * source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
 */
export function svelteExtractor(
  options?: SvelteExtractorOptions,
): ExtractorType {
  const { sveltePackages, whitespace = "auto" } = options ?? {};
  const resolvedWhitespace = resolveSvelteWhitespace(whitespace);

  return {
    match(filename) {
      return filename.endsWith(".svelte");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const syntheticName = filename.replace(/\.svelte$/, ".synthetic.tsx");

      const extractorCtx = createExtractorContext(ctx, { sveltePackages });
      const synthetic = buildSyntheticModule({
        source,
        sourceName: filename,
        syntheticName,
        whitespace: resolvedWhitespace,
        conventions: createSvelteFrameworkConventions(
          extractorCtx.linguiConfig,
          { sveltePackages },
        ),
      });
      if (synthetic.source.trim().length === 0) {
        return;
      }

      const transformed = transformProgram(synthetic.source, {
        filename: syntheticName,
        lang: "ts",
        linguiConfig: extractorCtx.linguiConfig,
        extract: true,
        translationMode: "extract",
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
      );
    },
  };
}

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: {
    sveltePackages?: readonly string[] | undefined;
  },
): ExtractorCtx & { linguiConfig: LinguiConfigNormalized } {
  const linguiConfig = normalizeLinguiConfig(ctx?.linguiConfig, options);
  return { ...ctx, linguiConfig };
}
