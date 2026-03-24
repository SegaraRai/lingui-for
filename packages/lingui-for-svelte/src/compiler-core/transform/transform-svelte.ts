import { lowerSvelteWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import type { SvelteTransformResult } from "./types.ts";

export function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): SvelteTransformResult | null {
  return lowerSvelteWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
  );
}
