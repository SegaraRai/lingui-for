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
  const filteredExpressions = filterExpressions(
    source,
    analysis.expressions,
    macroBindings,
  );
  const filteredComponents = analysis.componentCandidates.filter((candidate) =>
    macroBindings.components.has(candidate.tagName),
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

function filterExpressions(
  source: string,
  expressions: AstroExpression[],
  macroBindings: MacroBindings,
): AstroExpression[] {
  const results: AstroExpression[] = [];

  for (const expression of expressions) {
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
