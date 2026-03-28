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

export type ProgramTransformRequest =
  | {
      translationMode: "extract";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      runtimeBinding: null;
      inputSourceMap?: BabelSourceMap;
    }
  | {
      translationMode: "astro-context";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      runtimeBinding: string;
      inputSourceMap?: BabelSourceMap;
    };
