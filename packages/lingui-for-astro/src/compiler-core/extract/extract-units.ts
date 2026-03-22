import type { SourceMap } from "lingui-for-shared/compiler";

import {
  isExtractionCodeRelevant,
  lowerComponentMacro,
  lowerFrontmatterMacros,
  lowerTemplateExpression,
} from "../lower/index.ts";
import { createAstroPlan, type AstroPlan } from "../plan/index.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";

export function createAstroExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): { code: string; map: SourceMap | null }[] {
  const plan = createAstroPlan(source, options);
  return createAstroExtractionUnitsFromPlan(plan);
}

export function createAstroExtractionUnitsFromPlan(
  plan: AstroPlan,
): { code: string; map: SourceMap | null }[] {
  const units: { code: string; map: SourceMap | null }[] = [];

  const frontmatter = plan.items.find(
    (
      item,
    ): item is Extract<
      AstroPlan["items"][number],
      { kind: "frontmatter-macro-block" }
    > => item.kind === "frontmatter-macro-block",
  );

  if (frontmatter) {
    const transformedFrontmatter = lowerFrontmatterMacros(
      frontmatter.source,
      plan.options,
      {
        extract: true,
        runtimeBinding: plan.runtimeBindings.i18n,
        sourceMapOptions: {
          fullSource: plan.source,
          sourceStart: frontmatter.contentRange.start,
        },
      },
    );

    if (isExtractionCodeRelevant(transformedFrontmatter.code)) {
      units.push(transformedFrontmatter);
    }
  }

  for (const item of plan.items) {
    if (item.kind === "template-expression") {
      const transformed = lowerTemplateExpression(
        item.source,
        plan.macroImports,
        plan.options,
        {
          extract: true,
          runtimeBinding: plan.runtimeBindings.i18n,
          sourceMapOptions: {
            fullSource: plan.source,
            sourceStart: item.innerRange.start,
          },
        },
      );

      if (isExtractionCodeRelevant(transformed.code)) {
        units.push(transformed);
      }
    }

    if (item.kind === "component-macro") {
      const transformed = lowerComponentMacro(
        item.source,
        plan.macroImports,
        plan.options,
        {
          extract: true,
          runtimeBindings: plan.runtimeBindings,
          sourceMapOptions: {
            fullSource: plan.source,
            sourceStart: item.range.start,
          },
        },
      );

      if (isExtractionCodeRelevant(transformed.code)) {
        units.push(transformed);
      }
    }
  }

  return units;
}
