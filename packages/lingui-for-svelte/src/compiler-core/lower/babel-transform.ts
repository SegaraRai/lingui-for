import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import { getParserPlugins } from "../shared/config.ts";
import { createMacroPostprocessPlugin } from "./macro-rewrite.ts";
import type { ProgramTransform, ProgramTransformRequest } from "./types.ts";

/**
 * Runs the full Babel-based transform pipeline for one JS/TS program.
 *
 * @param code Program source text to transform.
 * @param request Transform configuration describing filename, parser mode, Lingui config,
 * extraction mode, translation mode, and runtime bindings.
 * @returns A {@link ProgramTransform} containing transformed code and transformed AST.
 *
 * The pipeline has two stages:
 * 1. run the official Lingui Babel macro plugin on Rust-prepared synthetic code
 * 2. postprocess Lingui's output into this project's raw, extract, or Svelte-context form
 */
export function transformProgram(
  code: string,
  request: ProgramTransformRequest,
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

  if (!result?.ast || result.code == null) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: (result.map as ProgramTransform["map"]) ?? null,
  };
}
