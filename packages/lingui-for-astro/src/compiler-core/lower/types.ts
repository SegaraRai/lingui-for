import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { SourceMap } from "lingui-for-shared/compiler";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: SourceMap | null;
}

export type ProgramTransformRequest =
  | {
      translationMode: "extract";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      inputSourceMap: SourceMap | null;
      runtimeBinding: null;
    }
  | {
      translationMode: "astro-context";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      inputSourceMap: SourceMap | null;
      runtimeBinding: string;
    };
