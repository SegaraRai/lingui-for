import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import {
  createCombinedProgramFromPlan,
  createModuleProgramFromPlan,
  transformProgram,
} from "../lower/index.ts";
import { createSveltePlan } from "../plan/index.ts";
import type { ExtractionUnit } from "./types.ts";

export function createExtractionUnits(
  source: string,
  options: LinguiSvelteTransformOptions,
): ExtractionUnit[] {
  const plan = createSveltePlan(source, options);
  const units: ExtractionUnit[] = [];
  const moduleProgram = createModuleProgramFromPlan(plan);
  const combinedProgram = createCombinedProgramFromPlan(plan);

  if (moduleProgram) {
    const transformedModule = transformProgram(moduleProgram.code, {
      extract: true,
      filename: moduleProgram.filename,
      lang: moduleProgram.lang,
      linguiConfig: plan.linguiConfig,
      translationMode: "extract",
      inputSourceMap: moduleProgram.inputSourceMap,
    });

    if (isExtractionCodeRelevant(transformedModule.code)) {
      units.push({
        code: transformedModule.code,
        map: transformedModule.map,
      });
    }
  }

  if (combinedProgram) {
    const transformedCombined = transformProgram(combinedProgram.code, {
      extract: true,
      filename: combinedProgram.filename,
      lang: combinedProgram.lang,
      linguiConfig: plan.linguiConfig,
      translationMode: "extract",
      inputSourceMap: combinedProgram.inputSourceMap,
    });

    if (isExtractionCodeRelevant(transformedCombined.code)) {
      units.push({
        code: transformedCombined.code,
        map: transformedCombined.map,
      });
    }
  }

  return units;
}

function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}
