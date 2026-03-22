import {
  buildOutputWithIndexedMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import {
  buildFrontmatterPrelude,
  buildFrontmatterTransformChunks,
  lowerComponentMacro,
  lowerTemplateExpression,
} from "../lower/index.ts";
import type { AstroPlan } from "../plan/index.ts";

function applyReplacementsToSource(
  source: string,
  replacements: ReplacementChunk[],
): string {
  const sorted = replacements.toSorted((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    return left.end - right.end;
  });

  let cursor = 0;
  let output = "";

  for (const replacement of sorted) {
    output += source.slice(cursor, replacement.start);
    output += replacement.code;
    cursor = replacement.end;
  }

  output += source.slice(cursor);
  return output;
}

function findClosingFenceStart(
  source: string,
  frontmatterRange: { start: number; end: number },
): number {
  const frontmatterSource = source.slice(
    frontmatterRange.start,
    frontmatterRange.end,
  );
  const closingFenceOffset = frontmatterSource.lastIndexOf("---");

  if (closingFenceOffset < 0) {
    return frontmatterRange.end;
  }

  return frontmatterRange.start + closingFenceOffset;
}

export function createAstroReplacementPlan(
  plan: AstroPlan,
): ReplacementChunk[] {
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
        runtimeBinding: plan.runtimeBindings.i18n,
      },
    );

    replacements.push({
      start: item.innerRange.start,
      end: item.innerRange.end,
      code: transformed.code,
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
        runtimeBindings: plan.runtimeBindings,
      },
    );

    replacements.push({
      start: item.range.start,
      end: item.range.end,
      code: replacement.code,
    });
  });

  const frontmatterMacroBlock = plan.items.find(
    (
      item,
    ): item is Extract<
      AstroPlan["items"][number],
      { kind: "frontmatter-macro-block" }
    > => item.kind === "frontmatter-macro-block",
  );
  const prelude = buildFrontmatterPrelude(
    plan.usesAstroI18n,
    plan.usesRuntimeTrans,
    plan.runtimeBindings,
  );

  if (plan.frontmatter) {
    const contentOffset = plan.frontmatter.contentRange.start;
    const relativeFrontmatterChunks = frontmatterMacroBlock
      ? buildFrontmatterTransformChunks(
          frontmatterMacroBlock.source,
          0,
          plan.options,
          { runtimeBinding: plan.runtimeBindings.i18n },
        )
      : [];
    const remainingFrontmatterContent = frontmatterMacroBlock
      ? applyReplacementsToSource(
          frontmatterMacroBlock.source,
          relativeFrontmatterChunks,
        )
      : plan.frontmatter.content;
    const hasRemainingFrontmatterContent =
      remainingFrontmatterContent.trim().length > 0;
    const preludeWithSeparator = hasRemainingFrontmatterContent
      ? `${prelude}\n`
      : prelude;

    // contentRange.start may point to the opening \n after the first ---
    // delimiter. Skip past it so the prelude lands after the newline (giving
    // ---\n<prelude>...) rather than before it (giving ---<prelude>\n...).
    let preludeInsertPoint = contentOffset;
    if (plan.source[preludeInsertPoint] === "\r") preludeInsertPoint++;
    if (plan.source[preludeInsertPoint] === "\n") preludeInsertPoint++;

    // Insert the runtime prelude as new text at the start of the frontmatter
    // content block. Using a zero-width chunk preserves every other character's
    // source position so the map stays accurate for all surrounding code.
    if (prelude.length > 0) {
      replacements.push({
        start: preludeInsertPoint,
        end: preludeInsertPoint,
        code: preludeWithSeparator,
      });
    }
    if (!hasRemainingFrontmatterContent) {
      const closingFenceStart = findClosingFenceStart(
        plan.source,
        plan.frontmatter.range,
      );

      if (plan.frontmatter.contentRange.end < closingFenceStart) {
        replacements.push({
          start: plan.frontmatter.contentRange.end,
          end: closingFenceStart,
          code: "",
        });
      }
    }
    // Push individual import-removal and expression-replacement chunks so that
    // each transformed call maps back to its exact original position instead of
    // mapping everything to the frontmatter start.
    if (frontmatterMacroBlock) {
      replacements.push(
        ...relativeFrontmatterChunks.map((chunk) => ({
          ...chunk,
          start: chunk.start + contentOffset,
          end: chunk.end + contentOffset,
        })),
      );
    }
  } else if (prelude.trim().length > 0) {
    replacements.push({
      start: 0,
      end: 0,
      code: `---\n${prelude}\n---\n`,
    });
  }

  return replacements;
}

export function applyAstroReplacementPlan(
  source: string,
  filename: string,
  replacements: ReplacementChunk[],
): { code: string; map: ReturnType<typeof buildOutputWithIndexedMap>["map"] } {
  const mapFile = stripQuery(filename);
  return buildOutputWithIndexedMap(source, mapFile, replacements);
}
