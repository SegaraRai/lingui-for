import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { lowerTemplateExpression } from "../lower/index.ts";
import type { RawSourceMap } from "source-map";

export function transformExpressionExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null } {
  return lowerTemplateExpression(source, macroImports, options, {
    extract: true,
    sourceMapOptions: {
      fullSource,
      sourceStart,
    },
  });
}
