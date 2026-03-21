import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { SourceMap } from "lingui-for-shared/compiler";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: SourceMap | null;
}

export interface ProgramTransformRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  translationMode: "extract" | "raw" | "astro-context";
  runtimeBinding?: string | undefined;
  inputSourceMap?: SourceMap | undefined;
}
