import MagicString from "magic-string";

import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { createAstroTransformContext } from "./astro-transform-context.ts";
import {
  buildFrontmatterPrelude,
  transformComponentMacro,
  transformFrontmatter,
  transformTemplateExpression,
} from "./transform-helpers.ts";
import type { AstroTransformResult } from "./types.ts";

/**
 * Transforms one `.astro` source file in place for runtime use.
 *
 * @param source Original `.astro` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source, source map, and the structural analysis used during the transform.
 *
 * This is the main Astro entry point for runtime compilation. It analyzes frontmatter and template
 * expressions, rewrites function macros against the request-scoped `i18n` binding, lowers
 * component macros to `RuntimeTrans`, and injects only the frontmatter prelude actually needed by
 * the rewritten file.
 */
export function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): AstroTransformResult {
  const context = createAstroTransformContext(source);
  const string = new MagicString(source);

  context.filteredExpressions
    .slice()
    .sort((left, right) => right.range.start - left.range.start)
    .forEach((expression) => {
      const transformed = transformTemplateExpression(
        source.slice(expression.innerRange.start, expression.innerRange.end),
        context.macroBindings.allImports,
        options,
      );
      string.overwrite(
        expression.range.start,
        expression.range.end,
        `{${transformed}}`,
      );
    });

  context.filteredComponents
    .slice()
    .sort((left, right) => right.range.start - left.range.start)
    .forEach((candidate) => {
      const replacement = transformComponentMacro(
        source.slice(candidate.range.start, candidate.range.end),
        context.macroBindings.componentImports,
        options,
      );
      string.overwrite(candidate.range.start, candidate.range.end, replacement);
    });

  const transformedFrontmatter = context.usesAstroI18n
    ? transformFrontmatter(context.frontmatterContent, options)
    : context.frontmatterContent;
  const prelude = buildFrontmatterPrelude(
    context.usesAstroI18n,
    context.usesRuntimeTrans,
  );
  const finalFrontmatter = [prelude, transformedFrontmatter]
    .filter((part) => part.trim().length > 0)
    .join("\n");

  if (context.analysis.frontmatter) {
    string.overwrite(
      context.analysis.frontmatter.contentRange.start,
      context.analysis.frontmatter.contentRange.end,
      finalFrontmatter,
    );
  } else if (finalFrontmatter.trim().length > 0) {
    string.prepend(`---\n${finalFrontmatter}\n---\n`);
  }

  return {
    code: string.toString(),
    map: null,
    analysis: context.analysis,
  };
}
