import { lowerSvelteWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import type { SvelteTransformResult } from "./types.ts";

export async function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): Promise<SvelteTransformResult | null> {
  return await lowerSvelteWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
  );
}
