import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
}

export type ProgramTransformRequest =
  | {
      translationMode: "extract";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      runtimeBinding: null;
    }
  | {
      translationMode: "astro-context";
      filename: string;
      linguiConfig: LinguiConfigNormalized;
      runtimeBinding: string;
    };
