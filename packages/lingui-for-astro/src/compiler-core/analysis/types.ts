/**
 * Byte-based half-open range within the original source text.
 */
export interface ByteRange {
  /**
   * Inclusive start offset.
   */
  start: number;
  /**
   * Exclusive end offset.
   */
  end: number;
}

/**
 * Text position reported by the Astro analyzer.
 */
export interface TextPoint {
  /**
   * Zero-based line number.
   */
  row: number;
  /**
   * Zero-based column number.
   */
  column: number;
}

/**
 * Source range for an Astro frontmatter block.
 */
export interface FrontmatterBlock {
  /**
   * Full `--- ... ---` block range.
   */
  range: ByteRange;
  /**
   * Inner content range without the frontmatter fences.
   */
  contentRange: ByteRange;
  /**
   * Start position of the full block.
   */
  start: TextPoint;
  /**
   * End position of the full block.
   */
  end: TextPoint;
}

/**
 * Supported kinds of Astro expression sites that can host Lingui macros.
 */
export const astroExpressionKinds = [
  "htmlInterpolation",
  "attributeInterpolation",
  "attributeBacktickString",
] as const;

/**
 * One supported Astro expression-site kind.
 */
export type AstroExpressionKind = (typeof astroExpressionKinds)[number];

/**
 * Expression range extracted from Astro source.
 */
export interface AstroExpression {
  /**
   * Structural kind of the expression site.
   */
  kind: AstroExpressionKind;
  /**
   * Full source range including wrapping braces or attribute delimiters.
   */
  range: ByteRange;
  /**
   * Inner JavaScript expression range without outer syntax.
   */
  innerRange: ByteRange;
  /**
   * Start position of the full expression site.
   */
  start: TextPoint;
  /**
   * End position of the full expression site.
   */
  end: TextPoint;
}

/**
 * Supported Astro tag forms that may host component macros.
 */
export const astroTagKinds = ["normal", "selfClosing"] as const;

/**
 * One supported Astro tag form.
 */
export type AstroTagKind = (typeof astroTagKinds)[number];

/**
 * Candidate Astro component tag identified during source analysis.
 */
export interface AstroComponentCandidate {
  /**
   * Raw tag name as written in source.
   */
  tagName: string;
  /**
   * Whether the tag is normal or self-closing.
   */
  tagKind: AstroTagKind;
  /**
   * Full source range of the tag or element.
   */
  range: ByteRange;
  /**
   * Range covering just the tag name token.
   */
  tagNameRange: ByteRange;
  /**
   * Range covering the opening tag start.
   */
  tagStartRange: ByteRange;
  /**
   * Start position of the candidate.
   */
  start: TextPoint;
  /**
   * End position of the candidate.
   */
  end: TextPoint;
}

/**
 * Source analysis result produced for one `.astro` file.
 */
export interface AstroAnalysis {
  /**
   * Frontmatter block when present, otherwise `null`.
   */
  frontmatter: FrontmatterBlock | null;
  /**
   * Expression sites that may require Lingui processing.
   */
  expressions: AstroExpression[];
  /**
   * Uppercase component tags that may correspond to component macros.
   */
  componentCandidates: AstroComponentCandidate[];
  /**
   * Whether the underlying Astro parse reported recoverable errors.
   */
  hasErrors: boolean;
}
