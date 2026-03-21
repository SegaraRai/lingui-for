import {
  buildOutputWithIndexedMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { createAstroTransformContext } from "./astro-transform-context.ts";
import { buildGeneratedSnippetMap, offsetSourceMap } from "./source-map.ts";
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
  const filename = stripQuery(options.filename);
  const mapFile = filename.split(/[\\/]/).at(-1) ?? filename;

  context.filteredExpressions.slice().forEach((expression) => {
    const transformed = transformTemplateExpression(
      source.slice(expression.innerRange.start, expression.innerRange.end),
      context.macroBindings.allImports,
      options,
      {
        fullSource: source,
        sourceStart: expression.innerRange.start,
      },
    );
    replacements.push({
      start: expression.innerRange.start,
      end: expression.innerRange.end,
      code: transformed.code,
      map: buildGeneratedSnippetMap(
        source,
        mapFile,
        expression.innerRange.start,
        transformed.code,
        expression.innerRange.end - expression.innerRange.start,
      ),
    });
  });

  context.filteredComponents.slice().forEach((candidate) => {
    const replacement = transformComponentMacro(
      source.slice(candidate.range.start, candidate.range.end),
      context.macroBindings.allImports,
      options,
      {
        fullSource: source,
        sourceStart: candidate.range.start,
      },
    );
    replacements.push({
      start: candidate.range.start,
      end: candidate.range.end,
      code: replacement.code,
      map: replacement.map,
    });
  });

  const transformedFrontmatter = context.usesAstroI18n
    ? transformFrontmatter(context.frontmatterContent, options, {
        fullSource: source,
        sourceStart: context.analysis.frontmatter?.contentRange.start ?? 0,
      })
    : {
        code: context.frontmatterContent,
        map: null,
      };
  const prelude = buildFrontmatterPrelude(
    context.usesAstroI18n,
    context.usesRuntimeTrans,
  );
  const finalFrontmatter = [prelude, transformedFrontmatter.code]
    .filter((part) => part.trim().length > 0)
    .join("");

  if (context.analysis.frontmatter) {
    replacements.push({
      start: context.analysis.frontmatter.contentRange.start,
      end: context.analysis.frontmatter.contentRange.end,
      code: finalFrontmatter,
      map:
        transformedFrontmatter.map == null
          ? null
          : offsetSourceMap(transformedFrontmatter.map, mapFile, prelude),
    });
  } else if (finalFrontmatter.trim().length > 0) {
    replacements.push({
      start: 0,
      end: 0,
      code: `---\n${finalFrontmatter}\n---\n`,
      map: null,
    });
  }

  const output = buildOutputWithIndexedMap(source, mapFile, replacements);

  return {
    code: output.code,
    map: output.map,
    analysis: context.analysis,
  };
}
