import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";
import type { RawSourceMap } from "source-map";

import type { ScriptLang } from "../shared/types.ts";

export type SourcePosition = {
  line: number;
  column: number;
};

export type ProgramTransform = {
  code: string;
  ast: BabelTypes.File;
  map: RawSourceMap | null;
};

export type MappedCodeFragment = {
  code: string;
  map: ProgramTransform["map"];
};

export type RuntimeBindingsForTransform = {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
};

export type ProgramTransformRequest = {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  translationMode: "extract" | "raw" | "svelte-context";
  runtimeBindings?: RuntimeBindingsForTransform | undefined;
  inputSourceMap?: RawSourceMap;
};
