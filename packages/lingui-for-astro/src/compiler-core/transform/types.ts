import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

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
