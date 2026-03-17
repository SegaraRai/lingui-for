import { analyzeAstro as analyzeAstroSync } from "astro-analyzer-wasm";

import type { AstroAnalysis } from "./types.ts";
import { initWasmOnce } from "./wasm.ts";

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
export function analyzeAstro(source: string): AnalyzeAstroResult {
  initWasmOnce();

  return {
    analysis: analyzeAstroSync(source) as AstroAnalysis,
  };
}
