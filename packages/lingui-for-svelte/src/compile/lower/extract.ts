import type { LinguiConfigNormalized } from "@lingui/conf";

import type { ScriptLang } from "@lingui-for/internal-lingui-analyzer-wasm";
import type { BabelSourceMap } from "@lingui-for/internal-shared-compile";

import {
  EAGER_TRANSLATION_WRAPPER,
  REACTIVE_TRANSLATION_WRAPPER,
} from "../common/constants.ts";
import {
  finalizeSvelteProgram,
  lowerProgramWithLingui,
  type ProgramTransform,
} from "./shared.ts";

export interface SvelteExtractProgramRequest {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  inputSourceMap?: BabelSourceMap;
}

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
    wrapperBindings: {
      reactiveTranslationWrapper: REACTIVE_TRANSLATION_WRAPPER,
      eagerTranslationWrapper: EAGER_TRANSLATION_WRAPPER,
    },
  });
}
