export { transformProgram } from "./babel-transform.ts";
export {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";
export { lowerSvelteWithRustSynthetic } from "./rust-synthetic.ts";
export type {
  MappedCodeFragment,
  ProgramTransform,
  ProgramTransformRequest,
  RuntimeBindingsForTransform,
  SourcePosition,
} from "./types.ts";
