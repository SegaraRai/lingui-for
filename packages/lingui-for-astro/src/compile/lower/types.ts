import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type {
  BabelSourceMap,
  CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: CanonicalSourceMap | null;
}

export interface AstroMacroPostprocessRequest {
  translationMode: "extract" | "astro-context";
  runtimeBinding: string | null;
}

export interface AstroExtractProgramRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
}

export interface AstroTransformProgramRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  runtimeBinding: string;
  inputSourceMap?: BabelSourceMap;
}
