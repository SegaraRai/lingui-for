import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import { fromBabelSourceMap } from "@lingui-for/internal-shared-compile";

import { getParserPlugins } from "../common/config.ts";
import { createAstroMacroPostprocessPlugin } from "./macro-rewrite.ts";
import type {
  AstroExtractProgramRequest,
  AstroMacroPostprocessRequest,
  AstroTransformProgramRequest,
  ProgramTransform,
} from "./types.ts";

export function transformAstroProgram(
  code: string,
  request:
    | {
        filename: AstroExtractProgramRequest["filename"];
        linguiConfig: AstroExtractProgramRequest["linguiConfig"];
        inputSourceMap?: AstroExtractProgramRequest["inputSourceMap"];
        extract: boolean;
        postprocess: AstroMacroPostprocessRequest;
      }
    | {
        filename: AstroTransformProgramRequest["filename"];
        linguiConfig: AstroTransformProgramRequest["linguiConfig"];
        inputSourceMap?: AstroTransformProgramRequest["inputSourceMap"];
        extract: boolean;
        postprocess: AstroMacroPostprocessRequest;
      },
): ProgramTransform {
  const result = transformSync(code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    inputSourceMap: request.inputSourceMap ?? undefined,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(),
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
      createAstroMacroPostprocessPlugin(request.postprocess),
    ],
    sourceMaps: true,
  });

  if (!result?.ast || result.code == null) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: fromBabelSourceMap(result.map),
  };
}
