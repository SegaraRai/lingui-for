import {
  analyzeAstro,
  initWasmOnce,
  type AstroAnalysis,
  type AstroComponentCandidate,
  type AstroExpression,
} from "#astro-analyzer-wasm";
import { PACKAGE_MACRO } from "../shared/constants.ts";
import {
  expressionUsesMacroBinding,
  parseMacroBindings,
  type MacroBindings,
} from "../shared/macro-bindings.ts";

export interface AstroTransformContext {
  analysis: AstroAnalysis;
  frontmatterContent: string;
  macroBindings: MacroBindings;
  filteredExpressions: AstroExpression[];
  filteredComponents: AstroComponentCandidate[];
  usesAstroI18n: boolean;
  usesRuntimeTrans: boolean;
}

export function createAstroTransformContext(
  source: string,
): AstroTransformContext {
  initWasmOnce();

  const analysis = analyzeAstro(source);
  const frontmatterContent = getFrontmatterContent(source, analysis);
  const macroBindings = parseMacroBindings(frontmatterContent);
  const filteredComponents = filterComponentCandidates(
    analysis.componentCandidates,
    macroBindings.components,
  );
  const filteredExpressions = filterExpressions(
    source,
    analysis.expressions,
    macroBindings,
    filteredComponents,
  );

  return {
    analysis,
    frontmatterContent,
    macroBindings,
    filteredExpressions,
    filteredComponents,
    usesAstroI18n:
      frontmatterContent.includes(PACKAGE_MACRO) ||
      filteredExpressions.length > 0,
    usesRuntimeTrans: filteredComponents.length > 0,
  };
}

export function getFrontmatterContent(
  source: string,
  analysis: AstroAnalysis,
): string {
  if (!analysis.frontmatter) {
    return "";
  }

  return source.slice(
    analysis.frontmatter.contentRange.start,
    analysis.frontmatter.contentRange.end,
  );
}

function filterComponentCandidates(
  candidates: readonly AstroComponentCandidate[],
  componentBindings: ReadonlySet<string>,
): AstroComponentCandidate[] {
  return candidates.filter((candidate) => {
    if (!componentBindings.has(candidate.tagName)) {
      return false;
    }

    return !candidates.some((other) => {
      return (
        other !== candidate &&
        componentBindings.has(other.tagName) &&
        other.range.start <= candidate.range.start &&
        other.range.end >= candidate.range.end
      );
    });
  });
}

function filterExpressions(
  source: string,
  expressions: AstroExpression[],
  macroBindings: MacroBindings,
  filteredComponents: readonly AstroComponentCandidate[],
): AstroExpression[] {
  const results: AstroExpression[] = [];

  for (const expression of expressions) {
    if (
      filteredComponents.some(
        (candidate) =>
          candidate.range.start <= expression.range.start &&
          candidate.range.end >= expression.range.end,
      )
    ) {
      continue;
    }

    const expressionSource = source.slice(
      expression.innerRange.start,
      expression.innerRange.end,
    );
    if (expressionUsesMacroBinding(expressionSource, macroBindings)) {
      results.push(expression);
    }
  }

  return results;
}
