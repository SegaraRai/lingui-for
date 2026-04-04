import { transformAstroProgram } from "./shared.ts";
import type {
  AstroTransformProgramRequest,
  ProgramTransform,
} from "./types.ts";

export function lowerAstroTransformProgram(
  code: string,
  request: AstroTransformProgramRequest,
): ProgramTransform {
  return transformAstroProgram(code, {
    ...request,
    extract: false,
    postprocess: {
      translationMode: "astro-context",
      runtimeBinding: request.runtimeBinding,
    },
  });
}
