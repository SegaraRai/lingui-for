import { parseSync, type NodePath } from "@babel/core";
import * as t from "@babel/types";
import { babelTraverse } from "lingui-for-shared/compiler";
import type { AstroAnalysis } from "#astro-analyzer-wasm";
import { getParserPlugins } from "../shared/config.ts";
import type { AstroRuntimeBindings } from "../shared/constants.ts";
import { PACKAGE_MACRO } from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  allocateAstroRuntimeBindings,
  createAstroTransformContext,
  type AstroTransformContext,
} from "./astro-transform-context.ts";

// All ranges in AstroPlanItem are JavaScript string character (UTF-16 code
// unit) offsets, not raw UTF-8 byte offsets from the WASM analyzer. The
// conversion happens in createAstroPlanFromContext via context.byteToChar.
export type CharRange = { start: number; end: number };

export type AstroPlanItem =
  | {
      kind: "frontmatter-macro-block";
      range: CharRange;
      contentRange: CharRange;
      source: string;
    }
  | {
      kind: "template-expression";
      range: CharRange;
      innerRange: CharRange;
      source: string;
    }
  | {
      kind: "component-macro";
      range: CharRange;
      source: string;
    };

export interface AstroPlan {
  source: string;
  options: LinguiAstroTransformOptions;
  analysis: AstroAnalysis;
  frontmatter:
    | {
        range: CharRange;
        contentRange: CharRange;
        content: string;
        macroImportRanges: CharRange[];
        macroExpressionRanges: CharRange[];
        hasMacroCalls: boolean;
        hasRemainingContentAfterImportRemoval: boolean;
        preludeInsertPoint: number;
        trailingWhitespaceRange: CharRange | null;
      }
    | undefined;
  macroImports: ReadonlyMap<string, string>;
  items: AstroPlanItem[];
  usesAstroI18n: boolean;
  usesRuntimeTrans: boolean;
  runtimeBindings: AstroRuntimeBindings;
}

function isOriginalMacroExpression(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
): boolean {
  const callee = path.isCallExpression() ? path.get("callee") : path.get("tag");

  if (!callee.isIdentifier()) {
    return false;
  }

  const binding = callee.scope.getBinding(callee.node.name);
  if (!binding?.path.isImportSpecifier()) {
    return false;
  }

  const importDeclaration = binding.path.parentPath;
  return (
    importDeclaration?.isImportDeclaration() === true &&
    importDeclaration.node.source.value === PACKAGE_MACRO
  );
}

function collectFrontmatterMacroRanges(content: string): {
  macroImportRanges: CharRange[];
  macroExpressionRanges: CharRange[];
} {
  const file = parseSync(content, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(),
    },
  });
  if (!file || !t.isFile(file)) {
    return {
      macroImportRanges: [],
      macroExpressionRanges: [],
    };
  }

  const macroImportRanges: CharRange[] = [];
  const macroExpressionRanges: CharRange[] = [];

  babelTraverse(file, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const start = path.node.start;
      const end = path.node.end;

      if (
        path.node.source.value !== PACKAGE_MACRO ||
        start == null ||
        end == null
      ) {
        return;
      }

      let nextEnd = end;
      while (
        nextEnd < content.length &&
        (content[nextEnd] === "\n" || content[nextEnd] === "\r")
      ) {
        nextEnd += 1;
      }

      macroImportRanges.push({ start, end: nextEnd });
    },
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isOriginalMacroExpression(path)) {
        return;
      }

      const start = path.node.start;
      const end = path.node.end;
      if (start == null || end == null) {
        return;
      }

      macroExpressionRanges.push({ start, end });
      path.skip();
    },
    TaggedTemplateExpression(path: NodePath<t.TaggedTemplateExpression>) {
      if (!isOriginalMacroExpression(path)) {
        return;
      }

      const start = path.node.start;
      const end = path.node.end;
      if (start == null || end == null) {
        return;
      }

      macroExpressionRanges.push({ start, end });
      path.skip();
    },
  });

  return {
    macroImportRanges: macroImportRanges.toSorted(
      (left, right) => left.start - right.start,
    ),
    macroExpressionRanges: macroExpressionRanges.toSorted(
      (left, right) => left.start - right.start,
    ),
  };
}

function hasRemainingContentAfterRemovingRanges(
  content: string,
  removalRanges: ReadonlyArray<CharRange>,
): boolean {
  let cursor = 0;

  for (const range of removalRanges) {
    if (content.slice(cursor, range.start).trim().length > 0) {
      return true;
    }
    cursor = range.end;
  }

  return content.slice(cursor).trim().length > 0;
}

function computePreludeInsertPoint(
  source: string,
  contentRangeStart: number,
): number {
  let preludeInsertPoint = contentRangeStart;
  if (source[preludeInsertPoint] === "\r") preludeInsertPoint++;
  if (source[preludeInsertPoint] === "\n") preludeInsertPoint++;
  return preludeInsertPoint;
}

function computeTrailingWhitespaceRange(
  source: string,
  frontmatterRange: CharRange,
  contentRange: CharRange,
): CharRange | null {
  const frontmatterSource = source.slice(frontmatterRange.start, frontmatterRange.end);
  const closingFenceOffset = frontmatterSource.lastIndexOf("---");

  if (closingFenceOffset < 0) {
    return null;
  }

  const closingFenceStart = frontmatterRange.start + closingFenceOffset;
  if (contentRange.end >= closingFenceStart) {
    return null;
  }

  const trailing = source.slice(contentRange.end, closingFenceStart);
  return trailing.trim().length === 0
    ? { start: contentRange.end, end: closingFenceStart }
    : null;
}

export function createAstroPlan(
  source: string,
  options: LinguiAstroTransformOptions,
): AstroPlan {
  const context = createAstroTransformContext(source);

  return createAstroPlanFromContext(source, options, context);
}

export function createAstroPlanFromContext(
  source: string,
  options: LinguiAstroTransformOptions,
  context: AstroTransformContext,
): AstroPlan {
  const items: AstroPlanItem[] = [];
  const toChar = context.byteToChar;

  const trimWhitespaceRange = (start: number, end: number): CharRange => {
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /\s/.test(source[trimmedStart] ?? "")) {
      trimmedStart += 1;
    }

    while (
      trimmedEnd > trimmedStart &&
      /\s/.test(source[trimmedEnd - 1] ?? "")
    ) {
      trimmedEnd -= 1;
    }

    return { start: trimmedStart, end: trimmedEnd };
  };

  if (
    context.analysis.frontmatter &&
    context.macroBindings.allImports.size > 0
  ) {
    const fm = context.analysis.frontmatter;
    const contentRange = {
      start: toChar(fm.contentRange.start),
      end: toChar(fm.contentRange.end),
    };
    items.push({
      kind: "frontmatter-macro-block",
      range: { start: toChar(fm.range.start), end: toChar(fm.range.end) },
      contentRange,
      source: context.frontmatterContent,
    });
  }

  context.filteredExpressions.forEach((expression) => {
    const trimmedInnerRange = trimWhitespaceRange(
      toChar(expression.innerRange.start),
      toChar(expression.innerRange.end),
    );
    items.push({
      kind: "template-expression",
      range: {
        start: toChar(expression.range.start),
        end: toChar(expression.range.end),
      },
      innerRange: trimmedInnerRange,
      source: source.slice(trimmedInnerRange.start, trimmedInnerRange.end),
    });
  });

  context.filteredComponents.forEach((component) => {
    const start = toChar(component.range.start);
    const end = toChar(component.range.end);
    items.push({
      kind: "component-macro",
      range: { start, end },
      source: source.slice(start, end),
    });
  });

  return {
    source,
    options,
    analysis: context.analysis,
    frontmatter: context.analysis.frontmatter
      ? (() => {
          const range = {
            start: toChar(context.analysis.frontmatter.range.start),
            end: toChar(context.analysis.frontmatter.range.end),
          };
          const contentRange = {
            start: toChar(context.analysis.frontmatter.contentRange.start),
            end: toChar(context.analysis.frontmatter.contentRange.end),
          };
          const { macroImportRanges, macroExpressionRanges } =
            collectFrontmatterMacroRanges(context.frontmatterContent);

          return {
            range,
            contentRange,
            content: context.frontmatterContent,
            macroImportRanges,
            macroExpressionRanges,
            hasMacroCalls: macroExpressionRanges.length > 0,
            hasRemainingContentAfterImportRemoval:
              hasRemainingContentAfterRemovingRanges(
                context.frontmatterContent,
                macroImportRanges,
              ),
            preludeInsertPoint: computePreludeInsertPoint(
              source,
              contentRange.start,
            ),
            trailingWhitespaceRange: computeTrailingWhitespaceRange(
              source,
              range,
              contentRange,
            ),
          };
        })()
      : undefined,
    macroImports: context.macroBindings.allImports,
    items,
    usesAstroI18n: context.usesAstroI18n,
    usesRuntimeTrans: context.usesRuntimeTrans,
    runtimeBindings: allocateAstroRuntimeBindings(
      context.frontmatterContent,
      options.filename,
    ),
  };
}
