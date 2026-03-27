import { lowerSvelteWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";

import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";

/**
 * Result returned by `transformSvelte`.
 */
export interface SvelteTransformResult {
  /**
   * Transformed `.svelte` source.
   */
  code: string;
  /**
   * Source map for the transformed file, or `null` when none is generated.
   */
  map: CanonicalSourceMap | null;
}

export async function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): Promise<SvelteTransformResult | null> {
  return await lowerSvelteWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
    options.whitespace,
  );
}
