import {
  buildOutputWithIndexedMap,
  offsetSourceMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import {
  buildFrontmatterPrelude,
  lowerComponentMacro,
  lowerFrontmatterMacros,
  lowerTemplateExpression,
} from "../lower/index.ts";
import type { AstroPlan } from "../plan/index.ts";

export function createAstroReplacementPlan(
  plan: AstroPlan,
): ReplacementChunk[] {
  const mapFile = stripQuery(plan.options.filename);
  const replacements: ReplacementChunk[] = [];

  plan.items.forEach((item) => {
    if (item.kind !== "template-expression") {
      return;
    }

    const transformed = lowerTemplateExpression(
      item.source,
      plan.macroImports,
      plan.options,
      {
        extract: false,
        sourceMapOptions: {
          fullSource: plan.source,
          sourceStart: item.innerRange.start,
        },
      },
    );

    replacements.push({
      start: item.innerRange.start,
      end: item.innerRange.end,
      code: transformed.code,
      map: transformed.map,
    });
  });

  plan.items.forEach((item) => {
    if (item.kind !== "component-macro") {
      return;
    }

    const replacement = lowerComponentMacro(
      item.source,
      plan.macroImports,
      plan.options,
      {
        extract: false,
        sourceMapOptions: {
          fullSource: plan.source,
          sourceStart: item.range.start,
        },
      },
    );

    replacements.push({
      start: item.range.start,
      end: item.range.end,
      code: replacement.code,
      map: replacement.map,
    });
  });

  const frontmatter = plan.items.find(
    (
      item,
    ): item is Extract<
      AstroPlan["items"][number],
      { kind: "frontmatter-macro-block" }
    > => item.kind === "frontmatter-macro-block",
  );
  const transformedFrontmatter = frontmatter
    ? lowerFrontmatterMacros(frontmatter.source, plan.options, {
        extract: false,
        sourceMapOptions: {
          fullSource: plan.source,
          sourceStart: frontmatter.contentRange.start,
        },
      })
    : {
        code: plan.frontmatter?.content ?? "",
        map: null,
      };
  const prelude = buildFrontmatterPrelude(
    plan.usesAstroI18n,
    plan.usesRuntimeTrans,
  );
  const finalFrontmatter = normalizeFrontmatterContent(
    [prelude, transformedFrontmatter.code]
      .filter((part) => part.trim().length > 0)
      .join(""),
  );

  if (plan.frontmatter) {
    const frontmatterPrefix = "---\n";
    const frontmatterSuffix = finalFrontmatter.endsWith("\n") ? "---" : "\n---";

    replacements.push({
      start: plan.frontmatter.range.start,
      end: plan.frontmatter.range.end,
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
  const mapFile = stripQuery(filename);
  return buildOutputWithIndexedMap(source, mapFile, replacements);
}
