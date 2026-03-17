import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { AstroAnalysis } from "#astro-analyzer-wasm";
import type { RawSourceMapLike } from "../shared/types.ts";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: RawSourceMapLike | null;
}

export interface ProgramTransformRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  translationMode: "extract" | "raw" | "astro-context";
  runtimeBinding?: string | undefined;
}

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
  map: RawSourceMapLike | null;
  /**
   * Source analysis reused by callers that need structural metadata.
   */
  analysis: AstroAnalysis;
}
