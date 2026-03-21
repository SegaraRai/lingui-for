import type { LinguiConfigNormalized } from "@lingui/conf";
import type * as BabelTypes from "@babel/types";
import type { RawSourceMap } from "source-map";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: RawSourceMap | null;
}

export interface ProgramTransformRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  translationMode: "extract" | "raw" | "astro-context";
  runtimeBinding?: string | undefined;
  inputSourceMap?: RawSourceMap | undefined;
}
