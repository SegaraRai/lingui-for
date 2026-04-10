import type { LinguiConfigNormalized } from "@lingui/conf";

import type { BabelSourceMap } from "@lingui-for/framework-core/compile";

import { transformAstroProgram, type ProgramTransform } from "./shared.ts";

export interface AstroExtractProgramRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
}

export function lowerAstroExtractProgram(
  code: string,
  request: AstroExtractProgramRequest,
): ProgramTransform {
  return transformAstroProgram(
    code,
    { ...request, extract: true },
    { translationMode: "extract" },
  );
}
