import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";

import { lowerAstroWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";

/**
 * Result returned by `transformAstro`.
 */
export interface AstroTransformResult {
  /**
   * Transformed `.astro` source.
   */
  code: string;
  /**
   * Source map for the transformed file, or `null` when none is generated.
   */
  map: CanonicalSourceMap | null;
}

/**
 * Transforms one `.astro` source file in place for runtime use.
 *
 * @param source Original `.astro` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source and source map.
 *
 * This is the main Astro entry point for runtime compilation. Rust handles analysis, planning, and
 * final lowering; JS only runs Babel/Lingui and returns the finished code and source map.
 */
export async function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): Promise<AstroTransformResult | null> {
  return await lowerAstroWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
  );
}
