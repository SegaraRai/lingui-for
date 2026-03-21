import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { lowerTemplateExpression } from "../lower/index.ts";
import type { MappedSnippet } from "./common.ts";

export function transformTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  return lowerTemplateExpression(
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
