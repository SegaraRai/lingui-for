import { transformFromAstSync, transformSync } from "@babel/core";
import { cloneNode, type File } from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import type { LinguiConfigNormalized } from "@lingui/conf";

import type { ScriptLang } from "@lingui-for/internal-lingui-analyzer-wasm";
import {
  fromBabelSourceMap,
  type BabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import { getParserPlugins } from "../common/config.ts";
import {
  createSvelteMacroPostprocessPlugin,
  type SvelteMacroPostprocessRequest,
} from "./macro-rewrite.ts";

export interface LinguiLoweredProgram {
  filename: string;
  source: string;
  ast: File;
  inputSourceMap?: BabelSourceMap;
}

export interface LinguiProgramLoweringRequest {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
  extract: boolean;
}

export interface ProgramTransform {
  filename: string;
  code: string;
  ast: File;
  map: CanonicalSourceMap | null;
}

export function lowerProgramWithLingui(
  code: string,
  request: LinguiProgramLoweringRequest,
): LinguiLoweredProgram {
  const result = transformSync(code, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    filename: request.filename,
    inputSourceMap: request.inputSourceMap ?? undefined,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(request.lang),
    },
    plugins: [
      [
        linguiMacroPlugin,
        {
          extract: request.extract,
          linguiConfig: request.linguiConfig,
          stripMessageField: request.extract ? false : undefined,
        },
      ],
    ],
    sourceMaps: true,
  });

  if (!result?.ast) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    filename: request.filename,
    source: code,
    ast: result.ast,
    inputSourceMap: request.inputSourceMap,
  };
}

export function finalizeSvelteProgram(
  lowered: LinguiLoweredProgram,
  request: SvelteMacroPostprocessRequest,
): ProgramTransform {
  const result = transformFromAstSync(
    cloneNode(lowered.ast, true),
    lowered.source,
    {
      ast: true,
      babelrc: false,
      code: true,
      configFile: false,
      filename: lowered.filename,
      inputSourceMap: lowered.inputSourceMap ?? undefined,
      plugins: [createSvelteMacroPostprocessPlugin(request)],
      sourceMaps: true,
    },
  );

  if (!result?.ast || result.code == null) {
    throw new Error("Failed to finalize lowered Svelte program");
  }

  return {
    filename: lowered.filename,
    code: result.code,
    ast: result.ast,
    map: fromBabelSourceMap(result.map),
  };
}
