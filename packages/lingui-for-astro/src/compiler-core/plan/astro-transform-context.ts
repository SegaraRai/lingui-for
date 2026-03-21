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
  byteToChar: (byteOffset: number) => number;
}

export function createAstroTransformContext(
  source: string,
): AstroTransformContext {
  initWasmOnce();

  const analysis = analyzeAstro(source);
  const byteToChar = buildByteToCharConverter(source);
  const frontmatterContent = getFrontmatterContent(
    source,
    analysis,
    byteToChar,
  );
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
    byteToChar,
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
    byteToChar,
  };
}

// Builds a mapping from UTF-8 byte offsets to JavaScript string (UTF-16 code
// unit) character offsets. The WASM analyzer returns byte-based ranges; this
// converter lets the rest of the pipeline work with character indices, which is
// what String.prototype.slice and MagicString expect.
export function buildByteToCharConverter(
  source: string,
): (byteOffset: number) => number {
  const bytes = new TextEncoder().encode(source);
  const table = new Int32Array(bytes.length + 1);
  let charPos = 0;
  let bytePos = 0;

  while (bytePos < bytes.length) {
    table[bytePos] = charPos;
    const byte = bytes[bytePos]!;
    let seqLen: number;
    if (byte < 0x80) {
      seqLen = 1;
    } else if (byte < 0xe0) {
      seqLen = 2;
    } else if (byte < 0xf0) {
      seqLen = 3;
    } else {
      // 4-byte UTF-8 sequence = supplementary code point = surrogate pair in JS
      seqLen = 4;
      charPos++;
    }
    bytePos += seqLen;
    charPos++;
  }
  table[bytePos] = charPos;

  return (byteOffset: number) => {
    const idx = Math.min(byteOffset, bytes.length);
    return table[idx]!;
  };
}

export function getFrontmatterContent(
  source: string,
  analysis: AstroAnalysis,
  byteToChar: (byteOffset: number) => number = buildByteToCharConverter(source),
): string {
  if (!analysis.frontmatter) {
    return "";
  }

  return source.slice(
    byteToChar(analysis.frontmatter.contentRange.start),
    byteToChar(analysis.frontmatter.contentRange.end),
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
  byteToChar: (byteOffset: number) => number,
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
      byteToChar(expression.innerRange.start),
      byteToChar(expression.innerRange.end),
    );
    if (expressionUsesMacroBinding(expressionSource, macroBindings)) {
      results.push(expression);
    }
  }

  return results;
}
