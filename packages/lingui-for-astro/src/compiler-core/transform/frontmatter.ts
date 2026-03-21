import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  buildFrontmatterPrelude,
  lowerFrontmatterMacros,
} from "../lower/index.ts";
import type { MappedSnippet } from "./common.ts";

export { buildFrontmatterPrelude };

export function transformFrontmatter(
  source: string,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  return lowerFrontmatterMacros(
    source,
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
