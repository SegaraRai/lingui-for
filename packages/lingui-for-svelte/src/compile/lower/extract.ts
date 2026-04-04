import { finalizeSvelteProgram, lowerProgramWithLingui } from "./shared.ts";
import type { ProgramTransform, SvelteExtractProgramRequest } from "./types.ts";

export function lowerSvelteExtractProgram(
  code: string,
  request: SvelteExtractProgramRequest,
): ProgramTransform {
  const lowered = lowerProgramWithLingui(code, {
    ...request,
    extract: true,
  });

  return finalizeSvelteProgram(lowered, {
    translationMode: "extract",
  });
}
