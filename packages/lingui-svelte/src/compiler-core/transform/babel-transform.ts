import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import type { RawSourceMap } from "source-map";

import { getParserPlugins } from "../shared/config.ts";
import type {
  ProgramTransform,
  ProgramTransformRequest,
} from "../shared/types.ts";
import {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";

export function transformProgram(
  code: string,
  request: ProgramTransformRequest,
): ProgramTransform {
  const preprocessed = transformSync(code, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    inputSourceMap: request.inputSourceMap,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(request.lang),
    },
    plugins: [createMacroPreprocessPlugin()],
    sourceMaps: true,
  });

  if (!preprocessed?.code) {
    throw new Error(`Failed to preprocess ${request.filename}`);
  }

  const result = transformSync(preprocessed.code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    inputSourceMap:
      (preprocessed.map as RawSourceMap | null | undefined) ??
      request.inputSourceMap,
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
      createMacroPostprocessPlugin(request),
    ],
    sourceMaps: true,
  });

  if (!result?.ast || !result.code) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: (result.map as RawSourceMap | null | undefined) ?? null,
  };
}
