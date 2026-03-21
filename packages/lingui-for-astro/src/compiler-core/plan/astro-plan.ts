import type { AstroAnalysis } from "#astro-analyzer-wasm";
import { PACKAGE_MACRO } from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
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
      }
    | undefined;
  macroImports: ReadonlyMap<string, string>;
  items: AstroPlanItem[];
  usesAstroI18n: boolean;
  usesRuntimeTrans: boolean;
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

  if (
    context.analysis.frontmatter &&
    context.frontmatterContent.includes(PACKAGE_MACRO)
  ) {
    const fm = context.analysis.frontmatter;
    items.push({
      kind: "frontmatter-macro-block",
      range: { start: toChar(fm.range.start), end: toChar(fm.range.end) },
      contentRange: {
        start: toChar(fm.contentRange.start),
        end: toChar(fm.contentRange.end),
      },
      source: context.frontmatterContent,
    });
  }

  context.filteredExpressions.forEach((expression) => {
    const innerStart = toChar(expression.innerRange.start);
    const innerEnd = toChar(expression.innerRange.end);
    items.push({
      kind: "template-expression",
      range: {
        start: toChar(expression.range.start),
        end: toChar(expression.range.end),
      },
      innerRange: { start: innerStart, end: innerEnd },
      source: source.slice(innerStart, innerEnd),
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
      ? {
          range: {
            start: toChar(context.analysis.frontmatter.range.start),
            end: toChar(context.analysis.frontmatter.range.end),
          },
          contentRange: {
            start: toChar(context.analysis.frontmatter.contentRange.start),
            end: toChar(context.analysis.frontmatter.contentRange.end),
          },
          content: context.frontmatterContent,
        }
      : undefined,
    macroImports: context.macroBindings.allImports,
    items,
    usesAstroI18n: context.usesAstroI18n,
    usesRuntimeTrans: context.usesRuntimeTrans,
  };
}
