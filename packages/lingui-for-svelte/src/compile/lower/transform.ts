import { finalizeSvelteProgram, lowerProgramWithLingui } from "./shared.ts";
import type {
  SvelteTransformProgramRequest,
  SvelteTransformPrograms,
} from "./types.ts";

export function lowerSvelteTransformPrograms(
  code: string,
  request: SvelteTransformProgramRequest,
): SvelteTransformPrograms {
  const linguiLowered = lowerProgramWithLingui(code, {
    ...request,
    extract: false,
  });

  return {
    lowered: finalizeSvelteProgram(linguiLowered, {
      translationMode: "lowered",
    }),
    contextual: finalizeSvelteProgram(linguiLowered, {
      translationMode: "contextual",
      runtimeBindings: request.runtimeBindings,
    }),
  };
}
