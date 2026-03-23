import {
  buildOutputWithIndexedMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { lowerSvelteWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import type { SvelteTransformResult } from "./types.ts";

export function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): SvelteTransformResult {
  const mapFile = stripQuery(options.filename);
  const replacements: ReplacementChunk[] = lowerSvelteWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
  );

  return buildOutputWithIndexedMap(source, mapFile, replacements);
}
