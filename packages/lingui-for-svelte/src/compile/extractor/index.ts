import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

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
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

export interface SvelteExtractorOptions {
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
  const { whitespace = "auto" } = options ?? {};
  const resolvedWhitespace = resolveSvelteWhitespace(whitespace);

  return {
    match(filename) {
      return filename.endsWith(".svelte");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const syntheticName = filename.replace(/\.svelte$/, ".synthetic.tsx");

      const extractorCtx = createExtractorContext(ctx);
      const synthetic = buildSyntheticModule({
        framework: "svelte",
        source,
        sourceName: filename,
        syntheticName,
        whitespace: resolvedWhitespace,
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

function createExtractorContext(ctx: ExtractorCtx | undefined): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(ctx?.linguiConfig);
  return { ...ctx, linguiConfig };
}
