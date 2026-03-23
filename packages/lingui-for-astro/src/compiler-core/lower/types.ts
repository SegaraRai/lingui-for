import type { TransformOptions } from "@babel/core";
import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";
import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

type BabelInputSourceMap = TransformOptions["inputSourceMap"];

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map?: EncodedSourceMap | null;
}

export type ProgramTransformRequest =
  | {
      translationMode: "extract";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      runtimeBinding: null;
      inputSourceMap?: BabelInputSourceMap;
    }
  | {
      translationMode: "astro-context";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      runtimeBinding: string;
      inputSourceMap?: BabelInputSourceMap;
    };
