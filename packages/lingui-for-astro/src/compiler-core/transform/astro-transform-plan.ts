import {
  buildOutputWithIndexedMap,
  offsetSourceMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import type { AstroTransformContext } from "./astro-transform-context.ts";
import {
  buildFrontmatterPrelude,
  transformComponentMacro,
  transformFrontmatter,
  transformTemplateExpression,
} from "./transform-helpers.ts";

export function createAstroReplacementPlan(
  source: string,
  context: AstroTransformContext,
  options: LinguiAstroTransformOptions,
): ReplacementChunk[] {
  const filename = stripQuery(options.filename);
  const mapFile = filename.split(/[\\/]/).at(-1) ?? filename;
  const replacements: ReplacementChunk[] = [];

  context.filteredExpressions.forEach((expression) => {
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
      map: transformed.map,
    });
  });

  context.filteredComponents.forEach((candidate) => {
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
  const finalFrontmatter = normalizeFrontmatterContent(
    [prelude, transformedFrontmatter.code]
      .filter((part) => part.trim().length > 0)
      .join(""),
  );

  if (context.analysis.frontmatter) {
    const frontmatterPrefix = "---\n";
    const frontmatterSuffix = finalFrontmatter.endsWith("\n") ? "---" : "\n---";

    replacements.push({
      start: context.analysis.frontmatter.range.start,
      end: context.analysis.frontmatter.range.end,
      code: `${frontmatterPrefix}${finalFrontmatter}${frontmatterSuffix}`,
      map:
        transformedFrontmatter.map == null
          ? null
          : offsetSourceMap(
              transformedFrontmatter.map,
              mapFile,
              `${frontmatterPrefix}${prelude}`,
            ),
    });
  } else if (finalFrontmatter.trim().length > 0) {
    replacements.push({
      start: 0,
      end: 0,
      code: `---\n${finalFrontmatter}\n---\n`,
      map: null,
    });
  }

  return replacements;
}

function normalizeFrontmatterContent(content: string): string {
  if (content.startsWith("\r\n")) {
    return content.slice(2);
  }

  if (content.startsWith("\n")) {
    return content.slice(1);
  }

  return content;
}

export function applyAstroReplacementPlan(
  source: string,
  filename: string,
  replacements: ReplacementChunk[],
): { code: string; map: ReturnType<typeof buildOutputWithIndexedMap>["map"] } {
  const mapFile =
    stripQuery(filename).split(/[\\/]/).at(-1) ?? stripQuery(filename);
  return buildOutputWithIndexedMap(source, mapFile, replacements);
}
