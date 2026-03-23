import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import { getParserPlugins } from "../shared/config.ts";
import {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";
import type { ProgramTransform, ProgramTransformRequest } from "./types.ts";

/**
 * Runs the full Babel-based transform pipeline for one JS/TS program.
 *
 * @param code Program source text to transform.
 * @param request Transform configuration describing filename, parser mode, Lingui config,
 * extraction mode, translation mode, and runtime bindings.
 * @returns A {@link ProgramTransform} containing transformed code and transformed AST.
 *
 * The pipeline has three stages:
 * 1. preprocess custom reactive syntax such as `$t`
 * 2. run the official Lingui Babel macro plugin
 * 3. postprocess Lingui's output into this project's raw, extract, or Svelte-context form
 */
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
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(request.lang),
    },
    plugins: [createMacroPreprocessPlugin(request)],
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
  });

  if (!result?.ast || result.code == null) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
  };
}
