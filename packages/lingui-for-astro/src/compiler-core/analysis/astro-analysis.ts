import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import initAstroAnalyzer, {
  analyzeAstro as analyzeAstroSync,
} from "astro-analyzer-wasm";

import type { AstroAnalysis } from "./types.ts";

let initPromise: Promise<void> | null = null;

async function resolveAnalyzerWasm(): Promise<Uint8Array | null> {
  const resolvers = [
    createRequire(import.meta.url),
    createRequire(join(process.cwd(), "__lingui_for_astro__.cjs")),
  ];

  for (const nodeRequire of resolvers) {
    try {
      const wasmPath = nodeRequire.resolve("astro-analyzer-wasm/wasm");
      return readFile(wasmPath);
    } catch {
      // Try the next resolver.
    }
  }

  return null;
}

async function ensureAstroAnalyzer(): Promise<void> {
  initPromise ??= (async () => {
    const wasmBytes = await resolveAnalyzerWasm();
    if (wasmBytes) {
      await initAstroAnalyzer({ module_or_path: wasmBytes });
      return;
    }

    await initAstroAnalyzer();
  })();

  await initPromise;
}

/**
 * Result returned by {@link analyzeAstro}.
 */
export interface AnalyzeAstroResult {
  /**
   * Source analysis produced by the Astro Wasm analyzer.
   */
  analysis: AstroAnalysis;
}

/**
 * Analyzes one `.astro` source file with the bundled Wasm analyzer.
 *
 * @param source Original `.astro` source text.
 * @returns The parsed frontmatter, expression ranges, component candidates, and parse status.
 *
 * The analyzer is initialized lazily on first use so callers can treat this as the main
 * source-analysis entry point for Astro transforms and extractors.
 */
export async function analyzeAstro(
  source: string,
): Promise<AnalyzeAstroResult> {
  await ensureAstroAnalyzer();

  return {
    analysis: analyzeAstroSync(source) as AstroAnalysis,
  };
}
