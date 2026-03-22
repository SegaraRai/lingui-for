import type * as BabelTypes from "@babel/types";
import type { EncodedSourceMap } from "@jridgewell/gen-mapping";
import type { LinguiConfigNormalized } from "@lingui/conf";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: EncodedSourceMap | null;
}

export type ProgramTransformRequest =
  | {
      translationMode: "extract";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      inputSourceMap: EncodedSourceMap | null;
      runtimeBinding: null;
    }
  | {
      translationMode: "astro-context";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      inputSourceMap: EncodedSourceMap | null;
      runtimeBinding: string;
    };
