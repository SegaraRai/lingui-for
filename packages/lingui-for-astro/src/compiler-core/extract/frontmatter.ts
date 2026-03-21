import type { RawSourceMap } from "source-map";

import { buildDirectProgramMap } from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "../transform/babel-transform.ts";

export function transformFrontmatterExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null } {
  return transformProgram(source, {
    extract: true,
    filename: `${options.filename}?frontmatter`,
    inputSourceMap: buildDirectProgramMap(
      fullSource,
      options.filename,
      sourceStart,
      source.length,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "extract",
  });
}
