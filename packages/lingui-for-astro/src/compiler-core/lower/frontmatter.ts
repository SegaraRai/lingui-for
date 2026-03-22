import { generate } from "@babel/generator";
import * as t from "@babel/types";

import {
  babelTraverse,
  LINGUI_TRANSLATE_METHOD,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  PACKAGE_RUNTIME,
  type AstroRuntimeBindings,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";

export function buildFrontmatterPrelude(
  includeAstroContext: boolean,
  includeRuntimeTrans: boolean,
  bindings: AstroRuntimeBindings,
): string {
  const lines: string[] = [];

  if (includeAstroContext) {
    lines.push(
      `import { createFrontmatterI18n as ${bindings.createI18n} } from "${PACKAGE_RUNTIME}";\n`,
      `const ${bindings.i18n} = ${bindings.createI18n}(Astro.locals);\n`,
    );
  }

  if (includeRuntimeTrans) {
    lines.push(
      `import { RuntimeTrans as ${bindings.runtimeTrans} } from "${PACKAGE_RUNTIME}";\n`,
    );
  }

  return lines.join("");
}

/**
 * Runs the frontmatter macro transform and returns individual replacement
 * chunks with positions adjusted to the absolute source offsets in the full
 * Astro file. Each chunk covers exactly one import removal or one macro
 * expression replacement, so the caller can push them directly into the
 * file-level replacement list and get per-expression source-map accuracy.
 */
export function buildFrontmatterTransformChunks(
  content: string,
  contentOffset: number,
  macroImportRanges: ReadonlyArray<{ start: number; end: number }>,
  macroExpressionRanges: ReadonlyArray<{ start: number; end: number }>,
  options: LinguiAstroTransformOptions,
  loweringOptions: { runtimeBinding: string },
): ReplacementChunk[] {
  const runtimeBinding = loweringOptions.runtimeBinding;
  const transformed = transformProgram(content, {
    translationMode: "astro-context",
    filename: `${options.filename}?frontmatter`,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    runtimeBinding,
  });
  const chunks = createFrontmatterReplacementChunks(
    transformed,
    macroImportRanges,
    macroExpressionRanges,
    runtimeBinding,
  );
  return chunks.map((chunk) => ({
    start: chunk.start + contentOffset,
    end: chunk.end + contentOffset,
    code: chunk.code,
  }));
}

function createFrontmatterReplacementChunks(
  transformed: { code: string; ast: t.File },
  macroImportRanges: ReadonlyArray<{ start: number; end: number }>,
  macroExpressionRanges: ReadonlyArray<{ start: number; end: number }>,
  runtimeBinding: string,
): ReplacementChunk[] {
  const transformedCalls = collectTransformedRuntimeCallCodes(
    transformed,
    runtimeBinding,
  );

  if (macroExpressionRanges.length !== transformedCalls.length) {
    throw new Error(
      `Frontmatter transform replacement count mismatch: expected ${macroExpressionRanges.length}, received ${transformedCalls.length}`,
    );
  }

  const replacements: ReplacementChunk[] = [];

  macroImportRanges.forEach((range) => {
    replacements.push({ start: range.start, end: range.end, code: "" });
  });

  macroExpressionRanges.forEach((range, index) => {
    const code = transformedCalls[index];

    if (code == null) {
      throw new Error("Missing transformed runtime call for frontmatter macro");
    }

    replacements.push({ start: range.start, end: range.end, code });
  });

  return replacements.filter(
    (replacement) =>
      replacement.start !== replacement.end || replacement.code.length > 0,
  );
}

function collectTransformedRuntimeCallCodes(
  transformed: { code: string; ast: t.File },
  runtimeBinding: string,
): string[] {
  const calls: string[] = [];

  babelTraverse(transformed.ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (
        !t.isMemberExpression(path.node.callee) ||
        path.node.callee.computed ||
        !t.isIdentifier(path.node.callee.object, {
          name: runtimeBinding,
        }) ||
        !t.isIdentifier(path.node.callee.property, {
          name: LINGUI_TRANSLATE_METHOD,
        })
      ) {
        return;
      }

      calls.push(
        generate(path.node, {
          comments: true,
          jsescOption: { minimal: true },
          retainLines: false,
        }).code,
      );
      path.skip();
    },
  });

  return calls;
}
