import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { lowerAstroWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { AstroTransformResult } from "./types.ts";

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
export function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): AstroTransformResult {
  const output = lowerAstroWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
  );

  return {
    code: output?.code ?? source,
    map: output?.map ?? null,
  };
}
