import {
  buildOutputWithIndexedMap,
  type ExtractionUnit,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import {
  createSyntheticMacroImports,
  lowerComponentMacro,
} from "../lower/snippet-lowering.ts";
import { createSveltePlan } from "../plan/index.ts";
import type { MacroBindings } from "../shared/macro-bindings.ts";
import { SYNTHETIC_PREFIX_EXPRESSION } from "../shared/constants.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";

export function createExtractionUnits(
  source: string,
  options: LinguiSvelteTransformOptions,
): ExtractionUnit[] {
  const plan = createSveltePlan(source, options);

  const units: ExtractionUnit[] = [];

  function buildExpressionUnit(
    snippetStart: number,
    snippetEnd: number,
    macroBindings: MacroBindings,
    stripRanges: ReadonlyArray<{ start: number; end: number }>,
  ): ExtractionUnit {
    const prefix = `${createSyntheticMacroImports(macroBindings)}const ${SYNTHETIC_PREFIX_EXPRESSION}0 = (\n`;
    const replacements: ReplacementChunk[] = [
      { start: 0, end: snippetStart, code: "" },
      { start: snippetStart, end: snippetStart, code: prefix },
      ...stripRanges.map((range) => ({
        start: range.start,
        end: range.end,
        code: "",
      })),
      { start: snippetEnd, end: snippetEnd, code: "\n);" },
      { start: snippetEnd, end: plan.source.length, code: "" },
    ];
    const { code, map } = buildOutputWithIndexedMap(
      plan.source,
      plan.filename,
      replacements,
    );
    return { code, map };
  }

  plan.moduleMacros.expressions.forEach((expression) => {
    units.push(
      buildExpressionUnit(
        expression.normalizedStart,
        expression.normalizedEnd,
        plan.moduleBindings,
        expression.stripRanges,
      ),
    );
  });

  plan.instanceMacros.expressions.forEach((expression) => {
    units.push(
      buildExpressionUnit(
        expression.normalizedStart,
        expression.normalizedEnd,
        plan.instanceBindings,
        expression.stripRanges,
      ),
    );
  });

  plan.analysis.expressions.forEach((expression) => {
    units.push(
      buildExpressionUnit(
        expression.normalizedStart,
        expression.normalizedEnd,
        plan.macroBindings,
        expression.stripRanges,
      ),
    );
  });

  // Component macros are lowered via Plan A (transformProgram with extract:true)
  // to correctly handle nested core macros (e.g. selectOrdinal inside Plural
  // attribute values). The extraction unit is still assembled from replacement
  // chunks so compile and extract share the same map-building strategy.
  plan.analysis.components.forEach((component) => {
    const lowered = lowerComponentMacro(
      component.source,
      component.start,
      plan,
      { extract: true },
    );
    const { map } = buildOutputWithIndexedMap(plan.source, plan.filename, [
      { start: 0, end: component.start, code: "" },
      {
        start: component.start,
        end: component.end,
        code: lowered.code,
      },
      { start: component.end, end: plan.source.length, code: "" },
    ]);
    delete map.sourcesContent;
    units.push({ code: lowered.code, map });
  });

  return units;
}
