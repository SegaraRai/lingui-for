export {
  analyzeAstro,
  type AnalyzeAstroResult,
} from "./analysis/astro-analysis.ts";
export type {
  AstroAnalysis,
  AstroComponentCandidate,
  AstroExpression,
  AstroExpressionKind,
  AstroTagKind,
  ByteRange,
  FrontmatterBlock,
  TextPoint,
} from "./analysis/types.ts";
export {
  normalizeJavaScriptLinguiConfig,
  normalizeLinguiConfig,
} from "./shared/config.ts";
export { isTransformableScript, stripQuery } from "./shared/paths.ts";
export type { LinguiAstroTransformOptions } from "./shared/types.ts";
export {
  createAstroExtractionUnits,
  transformAstro,
} from "./transform/transform-astro.ts";
export { transformJavaScriptMacros } from "./transform/transform-javascript.ts";
