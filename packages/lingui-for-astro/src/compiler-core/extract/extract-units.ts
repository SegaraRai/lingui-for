import type { RawSourceMap } from "source-map";

import { createAstroPlan, type AstroPlan } from "../plan/index.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformComponentExtractionUnit } from "./component-macro.ts";
import { isExtractionCodeRelevant } from "./common.ts";
import { transformFrontmatterExtractionUnit } from "./frontmatter.ts";
import { transformExpressionExtractionUnit } from "./template-expression.ts";

export function createAstroExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMap | null }[] {
  const plan = createAstroPlan(source, options);
  return createAstroExtractionUnitsFromPlan(plan);
}

export function createAstroExtractionUnitsFromPlan(
  plan: AstroPlan,
): { code: string; map: RawSourceMap | null }[] {
  const units: { code: string; map: RawSourceMap | null }[] = [];

  const frontmatter = plan.items.find(
    (
      item,
    ): item is Extract<
      AstroPlan["items"][number],
      { kind: "frontmatter-macro-block" }
    > => item.kind === "frontmatter-macro-block",
  );

  if (frontmatter) {
    const transformedFrontmatter = transformFrontmatterExtractionUnit(
      plan.source,
      frontmatter.source,
      frontmatter.contentRange.start,
      plan.options,
    );

    if (isExtractionCodeRelevant(transformedFrontmatter.code)) {
      units.push(transformedFrontmatter);
    }
  }

  for (const item of plan.items) {
    if (item.kind === "template-expression") {
      const transformed = transformExpressionExtractionUnit(
        plan.source,
        item.source,
        item.innerRange.start,
        plan.macroImports,
        plan.options,
      );

      if (isExtractionCodeRelevant(transformed.code)) {
        units.push(transformed);
      }
    }

    if (item.kind === "component-macro") {
      const transformed = transformComponentExtractionUnit(
        plan.source,
        item.source,
        item.range.start,
        plan.macroImports,
        plan.options,
      );

      if (isExtractionCodeRelevant(transformed.code)) {
        units.push(transformed);
      }
    }
  }

  return units;
}
