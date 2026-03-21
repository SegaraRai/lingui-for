import type { AstroAnalysis } from "#astro-analyzer-wasm";
import type { RawSourceMap } from "source-map";

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
  map: RawSourceMap | null;
  /**
   * Source analysis reused by callers that need structural metadata.
   */
  analysis: AstroAnalysis;
}
