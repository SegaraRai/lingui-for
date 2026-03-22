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
        code: prelude,
      });
    }
    // Push individual import-removal and expression-replacement chunks so that
    // each transformed call maps back to its exact original position instead of
    // mapping everything to the frontmatter start.
    if (frontmatterMacroBlock) {
      replacements.push(
        ...buildFrontmatterTransformChunks(
          frontmatterMacroBlock.source,
          contentOffset,
          plan.options,
          { runtimeBinding: plan.runtimeBindings.i18n },
        ),
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
