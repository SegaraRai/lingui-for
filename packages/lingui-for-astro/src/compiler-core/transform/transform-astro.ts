import {
  buildOutputWithIndexedMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

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
  const replacements: ReplacementChunk[] = [];

  context.filteredExpressions.slice().forEach((expression) => {
    const transformed = transformTemplateExpression(
      source.slice(expression.innerRange.start, expression.innerRange.end),
      context.macroBindings.allImports,
      options,
    );
    replacements.push({
      start: expression.range.start,
      end: expression.range.end,
      code: `{${transformed}}`,
      map: null,
    });
  });

  context.filteredComponents.slice().forEach((candidate) => {
    const replacement = transformComponentMacro(
      source.slice(candidate.range.start, candidate.range.end),
      context.macroBindings.allImports,
      options,
    );
    replacements.push({
      start: candidate.range.start,
      end: candidate.range.end,
      code: replacement,
      map: null,
    });
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
    .join("");

  if (context.analysis.frontmatter) {
    replacements.push({
      start: context.analysis.frontmatter.contentRange.start,
      end: context.analysis.frontmatter.contentRange.end,
      code: finalFrontmatter,
      map: null,
    });
  } else if (finalFrontmatter.trim().length > 0) {
    replacements.push({
      start: 0,
      end: 0,
      code: `---\n${finalFrontmatter}\n---\n`,
      map: null,
    });
  }

  const filename = stripQuery(options.filename);
  const mapFile = filename.split(/[\\/]/).at(-1) ?? filename;
  const output = buildOutputWithIndexedMap(source, mapFile, replacements);

  return {
    code: output.code,
    map: output.map,
    analysis: context.analysis,
  };
}
