import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { ScriptLang } from "@lingui-for/internal-lingui-analyzer-wasm";
import type {
  BabelSourceMap,
  CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

export interface ProgramTransform {
  filename: string;
  code: string;
  ast: BabelTypes.File;
  map: CanonicalSourceMap | null;
}

export interface LinguiLoweredProgram {
  filename: string;
  source: string;
  ast: BabelTypes.File;
  inputSourceMap?: BabelSourceMap;
}

export interface RuntimeBindingsForTransform {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
}

export interface LinguiProgramLoweringRequest {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
  extract: boolean;
}

export interface SvelteMacroPostprocessRequest {
  translationMode: "extract" | "lowered" | "contextual";
  runtimeBindings?: RuntimeBindingsForTransform | undefined;
}

export interface SvelteExtractProgramRequest {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
}

export interface SvelteTransformProgramRequest {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
  runtimeBindings: RuntimeBindingsForTransform;
}

export interface SvelteTransformPrograms {
  lowered: ProgramTransform;
  contextual: ProgramTransform;
}
