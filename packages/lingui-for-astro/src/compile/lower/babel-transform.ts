import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import { fromBabelSourceMap } from "@lingui-for/internal-shared-compile";

import { getParserPlugins } from "../common/config.ts";
import { createAstroMacroPostprocessPlugin } from "./macro-rewrite.ts";
import type { ProgramTransform, ProgramTransformRequest } from "./types.ts";

/**
 * Runs the Lingui Babel macro transform for an Astro synthetic program.
 *
 * Depending on `request.translationMode`, this either prepares extraction-ready code or rewrites
 * runtime translation calls so the generated Astro frontmatter can bind to the framework-specific
 * i18n local.
 *
 * @param code Synthetic module source generated from an `.astro` file.
 * @param request Transform settings, Lingui config, and Astro-specific post-processing details.
 * @returns The transformed Babel AST, emitted code, and normalized source map.
 */
export function transformProgram(
  code: string,
  request: ProgramTransformRequest,
): ProgramTransform {
  const extract = request.translationMode === "extract";
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
          extract,
          linguiConfig: request.linguiConfig,
          stripMessageField: extract ? false : undefined,
        },
      ],
      createAstroMacroPostprocessPlugin(request),
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
