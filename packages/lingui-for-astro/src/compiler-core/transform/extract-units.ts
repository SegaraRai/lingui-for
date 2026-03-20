import { PACKAGE_MACRO } from "../shared/constants.ts";
import type {
  LinguiAstroTransformOptions,
  RawSourceMapLike,
} from "../shared/types.ts";
import { createAstroTransformContext } from "./astro-transform-context.ts";
import {
  isExtractionCodeRelevant,
  transformComponentExtractionUnit,
  transformExpressionExtractionUnit,
  transformFrontmatterExtractionUnit,
} from "./transform-helpers.ts";

/**
 * Builds extraction-only Babel units for one `.astro` file.
 *
 * @param source Original `.astro` source.
 * @param options Extraction options including filename and optional Lingui config.
 * @returns Babel-extractable code units corresponding to frontmatter, expressions, and component
 * macros that contain Lingui messages.
 *
 * This powers the `.astro` extractor by reusing the same analysis and synthetic-program strategy
 * as the runtime transform while switching Lingui into extraction mode.
 */
export function createAstroExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null }[] {
  const context = createAstroTransformContext(source);
  const units: { code: string; map: RawSourceMapLike | null }[] = [];

  if (context.frontmatterContent.includes(PACKAGE_MACRO)) {
    const transformedFrontmatter = transformFrontmatterExtractionUnit(
      context.frontmatterContent,
      options,
    );

    if (isExtractionCodeRelevant(transformedFrontmatter.code)) {
      units.push({
        code: transformedFrontmatter.code,
        map: transformedFrontmatter.map,
      });
    }
  }

  for (const expression of context.filteredExpressions) {
    const transformed = transformExpressionExtractionUnit(
      source.slice(expression.innerRange.start, expression.innerRange.end),
      context.macroBindings.allImports,
      options,
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  for (const component of context.filteredComponents) {
    const transformed = transformComponentExtractionUnit(
      source.slice(component.range.start, component.range.end),
      context.macroBindings.allImports,
      options,
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  return units;
}
