import { transformSync } from "@babel/core";
import * as BabelTypes from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  fromBabelSourceMap,
  type BabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import { getParserPlugins } from "../common/config.ts";
import {
  createAstroMacroPostprocessPlugin,
  type AstroMacroPostprocessRequest,
} from "./macro-rewrite.ts";

export interface ProgramTransform {
  code: string;
  ast: BabelTypes.File;
  map: CanonicalSourceMap | null;
}

export interface LinguiProgramLoweringRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
  extract: boolean;
}

export function transformAstroProgram(
  code: string,
  lowering: LinguiProgramLoweringRequest,
  postprocess: AstroMacroPostprocessRequest,
): ProgramTransform {
  const result = transformSync(code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: lowering.filename,
    inputSourceMap: lowering.inputSourceMap ?? undefined,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(),
    },
    plugins: [
      [
        linguiMacroPlugin,
        {
          extract: lowering.extract,
          linguiConfig: lowering.linguiConfig,
          stripMessageField: lowering.extract ? false : undefined,
        },
      ],
      createAstroMacroPostprocessPlugin(postprocess),
    ],
    sourceMaps: true,
  });

  if (!result?.ast || result.code == null) {
    throw new Error(`Failed to transform ${lowering.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: fromBabelSourceMap(result.map),
  };
}
