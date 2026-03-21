import type { RawSourceMap } from "source-map";

import { buildPrefixedSnippetMap } from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "../transform/babel-transform.ts";
import { createComponentWrapperPrefix, WRAPPED_SUFFIX } from "./common.ts";

export function transformComponentExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null } {
  const prefix = createComponentWrapperPrefix(macroImports);
  return transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: true,
    filename: `${options.filename}?extract-component`,
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
