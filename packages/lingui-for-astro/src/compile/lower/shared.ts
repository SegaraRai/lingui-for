import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  createLinguiMacroPluginOptions,
  fromBabelSourceMap,
  type BabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/framework-core/compile";
import { transformSync } from "@lingui-for/framework-core/vendor/babel-core";
import type { File } from "@lingui-for/framework-core/vendor/babel-types";

import { getParserPlugins } from "../common/config.ts";
import {
  createAstroMacroPostprocessPlugin,
  type AstroMacroPostprocessRequest,
} from "./macro-rewrite.ts";

export interface ProgramTransform {
  code: string;
  ast: File;
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
        createLinguiMacroPluginOptions({
          extract: lowering.extract,
          linguiConfig: lowering.linguiConfig,
          pluginEntryUrl: import.meta
            .resolve("@lingui/babel-plugin-lingui-macro"),
        }),
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
