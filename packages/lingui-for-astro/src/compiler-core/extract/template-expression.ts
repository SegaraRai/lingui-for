import type { RawSourceMap } from "source-map";

import { buildPrefixedSnippetMap } from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "../transform/babel-transform.ts";
import {
  createSyntheticMacroImports,
  EXPR_PREFIX,
  WRAPPED_SUFFIX,
} from "./common.ts";

export function transformExpressionExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null } {
  const prefix = `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`;
  return transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: true,
    filename: `${options.filename}?extract-expression`,
    inputSourceMap: buildPrefixedSnippetMap(
      fullSource,
      options.filename,
      sourceStart,
      prefix,
      source.length,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "extract",
  });
}
