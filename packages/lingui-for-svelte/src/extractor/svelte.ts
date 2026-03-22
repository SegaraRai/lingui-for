import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import { runBabelExtractionUnits } from "lingui-for-shared/compiler";

import {
  createExtractionUnits,
  normalizeLinguiConfig,
  type LinguiSvelteTransformOptions,
} from "../compiler-core/index.ts";

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: LinguiSvelteTransformOptions,
): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(
    ctx?.linguiConfig ?? options?.linguiConfig,
  );
  return ctx ? { ...ctx, linguiConfig } : { linguiConfig };
}

/**
 * Lingui extractor implementation for `.svelte` files.
 *
 * The extractor accepts Svelte source, converts it into one or more extraction units via the
 * compiler core, and forwards each unit to Lingui's Babel-based extractor together with the
 * corresponding source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
 */
export const svelteExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".svelte");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx, {
      filename,
      linguiConfig: ctx?.linguiConfig,
    });
    const units = createExtractionUnits(source, {
      filename,
      linguiConfig: extractorCtx.linguiConfig,
    });

    await runBabelExtractionUnits(
      filename,
      units,
      onMessageExtracted,
      extractorCtx,
    );
  },
};
