import type { SourceMap } from "lingui-for-shared/compiler";

import type { AstroAnalysis } from "#astro-analyzer-wasm";

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
  map: SourceMap | null;
  /**
   * Source analysis reused by callers that need structural metadata.
   */
  analysis: AstroAnalysis;
}
