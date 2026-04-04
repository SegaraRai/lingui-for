import { transformAstroProgram } from "./shared.ts";
import type { AstroExtractProgramRequest, ProgramTransform } from "./types.ts";

export function lowerAstroExtractProgram(
  code: string,
  request: AstroExtractProgramRequest,
): ProgramTransform {
  return transformAstroProgram(code, {
    ...request,
    extract: true,
    postprocess: {
      translationMode: "extract",
      runtimeBinding: null,
    },
  });
}
