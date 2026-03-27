import type { TransformOptions } from "@babel/core";
import type * as BabelTypes from "@babel/types";
import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";
import type { LinguiConfigNormalized } from "@lingui/conf";

type BabelInputSourceMap = TransformOptions["inputSourceMap"];

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: CanonicalSourceMap | null;
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
