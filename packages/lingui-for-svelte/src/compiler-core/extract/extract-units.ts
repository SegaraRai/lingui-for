import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import {
  lowerComponentMacro,
  lowerScriptExpression,
  lowerTemplateExpression,
} from "../lower/index.ts";
import { createSveltePlan } from "../plan/index.ts";
import type { ExtractionUnit } from "./types.ts";

export function createExtractionUnits(
  source: string,
  options: LinguiSvelteTransformOptions,
): ExtractionUnit[] {
  const plan = createSveltePlan(source, options);
  const units: ExtractionUnit[] = [];

  plan.moduleMacros.expressions.forEach((expression, index) => {
    const lowered = lowerScriptExpression(
      expression.source,
      expression.start,
      plan,
      {
        extract: true,
        translationMode: "extract",
        filenameSuffix: `?extract-module-expression-${index}`,
        macroBindings: plan.moduleBindings,
      },
    );

    if (isExtractionCodeRelevant(lowered.code)) {
      units.push(normalizeExtractionUnit(lowered, source, plan.filename));
    }
  });

  plan.instanceMacros.expressions.forEach((expression, index) => {
    const lowered = lowerScriptExpression(
      expression.source,
      expression.start,
      plan,
      {
        extract: true,
        translationMode: "extract",
        filenameSuffix: `?extract-instance-expression-${index}`,
        macroBindings: plan.instanceBindings,
      },
    );

    if (isExtractionCodeRelevant(lowered.code)) {
      units.push(normalizeExtractionUnit(lowered, source, plan.filename));
    }
  });

  plan.analysis.expressions.forEach((expression) => {
    const lowered = lowerTemplateExpression(
      expression.source,
      expression.start,
      plan,
      {
        extract: true,
      },
    );

    if (isExtractionCodeRelevant(lowered.code)) {
      units.push(normalizeExtractionUnit(lowered, source, plan.filename));
    }
  });

  plan.analysis.components.forEach((component) => {
    const lowered = lowerComponentMacro(
      component.source,
      component.start,
      plan,
      {
        extract: true,
      },
    );

    if (isExtractionCodeRelevant(lowered.code)) {
      units.push(normalizeExtractionUnit(lowered, source, plan.filename));
    }
  });

  return units;
}

function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}

function normalizeExtractionUnit(
  unit: ExtractionUnit,
  source: string,
  filename: string,
): ExtractionUnit {
  return {
    code: unit.code,
    map: unit.map
      ? {
          ...unit.map,
          file: filename,
          sources: [filename],
          sourcesContent: [source],
        }
      : null,
  };
}
