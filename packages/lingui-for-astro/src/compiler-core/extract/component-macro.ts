import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { lowerComponentMacro } from "../lower/index.ts";
import type { RawSourceMap } from "source-map";

export function transformComponentExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null } {
  return lowerComponentMacro(source, macroImports, options, {
    extract: true,
    sourceMapOptions: {
      fullSource,
      sourceStart,
    },
  });
}
