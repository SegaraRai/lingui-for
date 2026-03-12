import type * as BabelTypes from "@babel/types";
import type { LinguiConfig, LinguiConfigNormalized } from "@lingui/conf";
import type MagicString from "magic-string";
import type { RawSourceMap } from "source-map";
import type { AST } from "svelte/compiler";

export type SourcePosition = {
  line: number;
  column: number;
};

export type ScriptLang = "js" | "ts";
export type ScriptKind = "instance" | "module";

export type RangeNode = {
  start: number;
  end: number;
};

export type LinguiSvelteTransformOptions = {
  filename: string;
  linguiConfig?: Partial<LinguiConfig>;
};

export type ExtractionUnit = {
  code: string;
  map: RawSourceMap | null;
};

export type ScriptBlock = {
  kind: ScriptKind;
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  content: string;
  lang: ScriptLang;
  attributes: AST.Attribute[];
};

export type MarkupExpression = RangeNode & {
  index: number;
  source: string;
};

export type SvelteAnalysis = {
  instance: ScriptBlock | null;
  module: ScriptBlock | null;
  expressions: MarkupExpression[];
};

export type ProgramTransform = {
  code: string;
  ast: BabelTypes.File;
  map: RawSourceMap | null;
};

export type ProgramTransformRequest = {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  inputSourceMap?: RawSourceMap;
};

export type SvelteTransformResult = {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
};
