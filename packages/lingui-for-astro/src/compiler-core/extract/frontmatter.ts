import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { lowerFrontmatterMacros } from "../lower/index.ts";
import type { RawSourceMap } from "source-map";

export function transformFrontmatterExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null } {
  return lowerFrontmatterMacros(source, options, {
    extract: true,
    sourceMapOptions: {
      fullSource,
      sourceStart,
    },
  });
}
