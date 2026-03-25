import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

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
  map: EncodedSourceMap | null;
}
