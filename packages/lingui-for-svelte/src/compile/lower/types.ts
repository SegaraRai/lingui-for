import type { TransformOptions } from "@babel/core";
import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { ScriptLang } from "@lingui-for/internal-lingui-analyzer-wasm";
import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";

type BabelInputSourceMap = TransformOptions["inputSourceMap"];

export type ProgramTransform = {
  code: string;
  ast: BabelTypes.File;
  map: CanonicalSourceMap | null;
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
  inputSourceMap?: BabelInputSourceMap;
  runtimeBindings?: RuntimeBindingsForTransform | undefined;
};
