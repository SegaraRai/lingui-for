import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { lowerComponentMacro } from "../lower/index.ts";
import type { MappedSnippet } from "./common.ts";

export function transformComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  return lowerComponentMacro(
    source,
    macroImports,
    options,
    sourceMapOptions
      ? {
          extract: false,
          sourceMapOptions,
        }
      : {
          extract: false,
        },
  );
}
