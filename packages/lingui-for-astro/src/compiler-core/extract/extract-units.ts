import {
  buildOutputWithIndexedMap,
  type ExtractionUnit,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { lowerComponentMacro } from "../lower/component-macro.ts";
import {
  EXPR_PREFIX,
  WRAPPED_SUFFIX,
  createSyntheticMacroImports,
} from "../lower/common.ts";
import { createAstroPlan, type AstroPlan } from "../plan/index.ts";
import {
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";

function buildExtractionUnit(
  fullSource: string,
  filename: string,
  snippetStart: number,
  snippetEnd: number,
  prefix: string,
  suffix: string,
): ExtractionUnit {
  const replacements: ReplacementChunk[] = [
    { start: 0, end: snippetStart, code: "" },
    { start: snippetStart, end: snippetStart, code: prefix },
    { start: snippetEnd, end: snippetEnd, code: suffix },
    { start: snippetEnd, end: fullSource.length, code: "" },
  ];
  const { code, map } = buildOutputWithIndexedMap(
    fullSource,
    filename,
    replacements,
  );
  return { code, map };
}

export function createAstroExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): ExtractionUnit[] {
  const plan = createAstroPlan(source, options);
  return createAstroExtractionUnitsFromPlan(plan);
}

export function createAstroExtractionUnitsFromPlan(
  plan: AstroPlan,
): ExtractionUnit[] {
  const units: ExtractionUnit[] = [];
  const filename = plan.options.filename;

  const frontmatterItem = plan.items.find(
    (
      item,
    ): item is Extract<
      AstroPlan["items"][number],
      { kind: "frontmatter-macro-block" }
    > => item.kind === "frontmatter-macro-block",
  );

  if (
    frontmatterItem &&
    plan.frontmatter &&
    plan.frontmatter.hasMacroCalls
  ) {
    units.push(
      buildExtractionUnit(
        plan.source,
        filename,
        plan.frontmatter.contentRange.start,
        plan.frontmatter.contentRange.end,
        "",
        "",
      ),
    );
  }

  for (const item of plan.items) {
    if (item.kind === "template-expression") {
      const prefix = `${createSyntheticMacroImports(plan.macroImports)}${EXPR_PREFIX}`;
      units.push(
        buildExtractionUnit(
          plan.source,
          filename,
          item.innerRange.start,
          item.innerRange.end,
          prefix,
          WRAPPED_SUFFIX,
        ),
      );
    }

    if (item.kind === "component-macro") {
      // Use Plan A lowering for component macros to correctly handle nested core
      // macro calls (e.g. selectOrdinal inside Plural attribute values).
      // Build a source map by overwriting the original component range with the
      // lowered code so that Lingui can trace origin back to the correct file and
      // line (using the source map) rather than falling back to a raw filename.
      const lowered = lowerComponentMacro(
        plan.source.slice(item.range.start, item.range.end),
        plan.macroImports,
        plan.options,
        {
          extract: true,
          runtimeBindings: {
            i18n: RUNTIME_BINDING_I18N,
            runtimeTrans: RUNTIME_BINDING_RUNTIME_TRANS,
          },
        },
      );
      const { map } = buildOutputWithIndexedMap(plan.source, filename, [
        { start: 0, end: item.range.start, code: "" },
        {
          start: item.range.start,
          end: item.range.end,
          code: lowered.code,
        },
        { start: item.range.end, end: plan.source.length, code: "" },
      ]);
      units.push({ code: lowered.code, map });
    }
  }

  return units;
}
