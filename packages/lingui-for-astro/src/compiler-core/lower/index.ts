export type { LoweredSnippet, LoweringSourceMapOptions } from "./common.ts";
export type { ProgramTransform, ProgramTransformRequest } from "./types.ts";
export {
  createComponentWrapperPrefix,
  createSyntheticMacroImports,
  EXPR_PREFIX,
  isExtractionCodeRelevant,
  WRAPPED_SUFFIX,
} from "./common.ts";
export { transformProgram } from "./babel-transform.ts";
export {
  buildFrontmatterPrelude,
  buildFrontmatterTransformChunks,
  lowerFrontmatterMacros,
} from "./frontmatter.ts";
export { lowerTemplateExpression } from "./template-expression.ts";
export { lowerComponentMacro } from "./component-macro.ts";
