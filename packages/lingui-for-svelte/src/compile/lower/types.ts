import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { ScriptLang } from "@lingui-for/internal-lingui-analyzer-wasm";
import type {
  BabelSourceMap,
  CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: CanonicalSourceMap | null;
}

export interface RuntimeBindingsForTransform {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
}

export interface ProgramTransformRequest {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  translationMode: "extract" | "raw" | "svelte-context";
  inputSourceMap?: BabelSourceMap;
  runtimeBindings?: RuntimeBindingsForTransform | undefined;
}
