import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  buildSyntheticModule,
  type SyntheticModule,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  toBabelSourceMap,
} from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  type LinguiSvelteTransformOptions,
} from "../compiler-core/index.ts";
import { transformProgram } from "../compiler-core/lower/babel-transform.ts";

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: LinguiSvelteTransformOptions,
): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(
    ctx?.linguiConfig ?? options?.linguiConfig,
  );
  return { ...ctx, linguiConfig };
}

async function buildSyntheticExtractionUnit(
  filename: string,
  source: string,
  whitespace: "jsx" | "astro" | "svelte",
): Promise<SyntheticModule> {
  return buildSyntheticModule({
    framework: "svelte",
    source,
    sourceName: filename,
    syntheticName: filename.replace(/\.svelte$/, ".synthetic.tsx"),
    whitespace,
  });
}

/**
 * Lingui extractor implementation factory for `.svelte` files.
 *
 * The extractor accepts Svelte source, lowers it into a single Rust-generated synthetic module,
 * and forwards that module to Lingui's Babel-based extractor together with the corresponding
 * source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
 */
export function svelteExtractor(options?: {
  whitespace?: "jsx" | "auto" | "astro" | "svelte";
}): ExtractorType {
  const whitespace =
    options?.whitespace == null || options.whitespace === "auto"
      ? "svelte"
      : options.whitespace;

  return {
    match(filename) {
      return filename.endsWith(".svelte");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const extractorCtx = createExtractorContext(ctx, {
        filename,
        linguiConfig: ctx?.linguiConfig,
      });
      const synthetic = await buildSyntheticExtractionUnit(
        filename,
        source,
        whitespace,
      );
      if (synthetic.source.trim().length === 0) {
        return;
      }

      const transformed = transformProgram(synthetic.source, {
        filename: filename.replace(/\.svelte$/, ".synthetic.tsx"),
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
            map: transformed.map ?? undefined,
          },
        ],
        onMessageExtracted,
        extractorCtx,
      );
    },
  };
}
