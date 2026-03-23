import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ExtractorCtx, ExtractorType } from "@lingui/conf";
import {
  buildSyntheticModuleWithOptions,
  initSync,
} from "lingui-analyzer-wasm";

import { runBabelExtractionUnits } from "lingui-for-shared/compiler";

import {
  normalizeLinguiConfig,
  type LinguiSvelteTransformOptions,
} from "../compiler-core/index.ts";

type SyntheticExtractionUnit = {
  source: string;
  source_map_json?: string | null;
};

let wasmInitialized = false;

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: LinguiSvelteTransformOptions,
): ExtractorCtx {
  const linguiConfig = normalizeLinguiConfig(
    ctx?.linguiConfig ?? options?.linguiConfig,
  );
  return ctx ? { ...ctx, linguiConfig } : { linguiConfig };
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
    framework: "svelte",
    source,
    source_name: filename,
    synthetic_name: filename.replace(/\.svelte$/, ".synthetic.tsx"),
  }) as SyntheticExtractionUnit;
}

/**
 * Lingui extractor implementation for `.svelte` files.
 *
 * The extractor accepts Svelte source, lowers it into a single Rust-generated synthetic module,
 * and forwards that module to Lingui's Babel-based extractor together with the corresponding
 * source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
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
    );
  },
};
