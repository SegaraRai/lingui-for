import type {
  AstroAnalysis,
  AstroComponentCandidate,
  AstroExpression,
  FrontmatterBlock,
} from "#astro-analyzer-wasm";

import { PACKAGE_MACRO } from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  createAstroTransformContext,
  type AstroTransformContext,
} from "./astro-transform-context.ts";

export type AstroPlanItem =
  | {
      kind: "frontmatter-macro-block";
      range: FrontmatterBlock["range"];
      contentRange: FrontmatterBlock["contentRange"];
      source: string;
    }
  | {
      kind: "template-expression";
      range: AstroExpression["range"];
      innerRange: AstroExpression["innerRange"];
      source: string;
    }
  | {
      kind: "component-macro";
      range: AstroComponentCandidate["range"];
      source: string;
    };

export interface AstroPlan {
  source: string;
  options: LinguiAstroTransformOptions;
  analysis: AstroAnalysis;
  frontmatter:
    | {
        range: FrontmatterBlock["range"];
        contentRange: FrontmatterBlock["contentRange"];
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

  if (
    context.analysis.frontmatter &&
    context.frontmatterContent.includes(PACKAGE_MACRO)
  ) {
    items.push({
      kind: "frontmatter-macro-block",
      range: context.analysis.frontmatter.range,
      contentRange: context.analysis.frontmatter.contentRange,
      source: context.frontmatterContent,
    });
  }

  context.filteredExpressions.forEach((expression) => {
    items.push({
      kind: "template-expression",
      range: expression.range,
      innerRange: expression.innerRange,
      source: source.slice(
        expression.innerRange.start,
        expression.innerRange.end,
      ),
    });
  });

  context.filteredComponents.forEach((component) => {
    items.push({
      kind: "component-macro",
      range: component.range,
      source: source.slice(component.range.start, component.range.end),
    });
  });

  return {
    source,
    options,
    analysis: context.analysis,
    frontmatter: context.analysis.frontmatter
      ? {
          range: context.analysis.frontmatter.range,
          contentRange: context.analysis.frontmatter.contentRange,
          content: context.frontmatterContent,
        }
      : undefined,
    macroImports: context.macroBindings.allImports,
    items,
    usesAstroI18n: context.usesAstroI18n,
    usesRuntimeTrans: context.usesRuntimeTrans,
  };
}
