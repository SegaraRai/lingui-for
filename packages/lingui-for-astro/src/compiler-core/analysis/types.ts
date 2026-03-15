export interface ByteRange {
  start: number;
  end: number;
}

export interface TextPoint {
  row: number;
  column: number;
}

export interface FrontmatterBlock {
  range: ByteRange;
  contentRange: ByteRange;
  start: TextPoint;
  end: TextPoint;
}

export const astroExpressionKinds = [
  "htmlInterpolation",
  "attributeInterpolation",
  "attributeBacktickString",
] as const;

export type AstroExpressionKind = (typeof astroExpressionKinds)[number];

export interface AstroExpression {
  kind: AstroExpressionKind;
  range: ByteRange;
  innerRange: ByteRange;
  start: TextPoint;
  end: TextPoint;
}

export const astroTagKinds = ["normal", "selfClosing"] as const;

export type AstroTagKind = (typeof astroTagKinds)[number];

export interface AstroComponentCandidate {
  tagName: string;
  tagKind: AstroTagKind;
  range: ByteRange;
  tagNameRange: ByteRange;
  tagStartRange: ByteRange;
  start: TextPoint;
  end: TextPoint;
}

export interface AstroAnalysis {
  frontmatter: FrontmatterBlock | null;
  expressions: AstroExpression[];
  componentCandidates: AstroComponentCandidate[];
  hasErrors: boolean;
}
