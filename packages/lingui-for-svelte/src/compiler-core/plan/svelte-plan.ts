import type { LinguiConfigNormalized } from "@lingui/conf";

import { analyzeSvelte } from "../analysis/svelte-analysis.ts";
import type { SvelteAnalysis } from "../analysis/types.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";

export type SveltePlan = {
  source: string;
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  analysis: SvelteAnalysis;
};

export function createSveltePlan(
  source: string,
  options: LinguiSvelteTransformOptions,
): SveltePlan {
  return {
    source,
    filename: options.filename,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    analysis: analyzeSvelte(source, options.filename),
  };
}
