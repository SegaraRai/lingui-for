import type { LinguiConfigNormalized } from "@lingui/conf";

import type { BabelSourceMap } from "@lingui-for/framework-core/compile";

import { transformAstroProgram, type ProgramTransform } from "./shared.ts";

export interface AstroTransformProgramRequest {
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  runtimeBinding: string;
  inputSourceMap?: BabelSourceMap;
}

export function lowerAstroTransformProgram(
  code: string,
  request: AstroTransformProgramRequest,
): ProgramTransform {
  return transformAstroProgram(
    code,
    { ...request, extract: false },
    {
      translationMode: "contextual",
      runtimeBinding: request.runtimeBinding,
    },
  );
}
