import type { LinguiConfigNormalized } from "@lingui/conf";

import type { ScriptLang } from "@lingui-for/internal-lingui-analyzer-wasm";
import type { BabelSourceMap } from "@lingui-for/internal-shared-compile";

import type { RuntimeBindingsForTransform } from "./macro-rewrite.ts";
import {
  finalizeSvelteProgram,
  lowerProgramWithLingui,
  type ProgramTransform,
} from "./shared.ts";

export interface SvelteTransformProgramRequest {
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
  runtimeBindings: RuntimeBindingsForTransform;
  loweredFilename: string;
  contextualFilename: string;
}

export interface SvelteTransformPrograms {
  lowered: ProgramTransform;
  contextual: ProgramTransform;
}

export function lowerSvelteTransformPrograms(
  code: string,
  request: SvelteTransformProgramRequest,
): SvelteTransformPrograms {
  const {
    runtimeBindings,
    loweredFilename,
    contextualFilename,
    ...loweringRequest
  } = request;

  const linguiLowered = lowerProgramWithLingui(code, {
    ...loweringRequest,
    filename: loweredFilename,
    extract: false,
  });

  return {
    lowered: finalizeSvelteProgram(
      linguiLowered,
      {
        translationMode: "lowered",
      },
      loweredFilename,
    ),
    contextual: finalizeSvelteProgram(
      linguiLowered,
      {
        translationMode: "contextual",
        runtimeBindings,
      },
      contextualFilename,
    ),
  };
}
