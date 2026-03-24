export { transformProgram } from "./babel-transform.ts";
export {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";
export {
  buildCompilePlan,
  lowerSvelteWithRustSynthetic,
} from "./rust-synthetic.ts";
export type {
  MappedCodeFragment,
  ProgramTransform,
  ProgramTransformRequest,
  RuntimeBindingsForTransform,
  SourcePosition,
} from "./types.ts";
