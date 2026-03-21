export { transformProgram } from "./babel-transform.ts";
export {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";
export {
  createCombinedProgramFromPlan,
  createModuleProgramFromPlan,
} from "./programs.ts";
export {
  lowerComponentMacro,
  lowerScriptExpression,
  lowerTemplateExpression,
} from "./snippet-lowering.ts";
export {
  addLineMappings,
  buildDirectProgramMap,
  buildGeneratedSnippetMap,
  buildPrefixedSnippetMap,
  composeSourceMaps,
  createOffsetToPosition,
} from "./source-map.ts";
export { buildCombinedProgram } from "./synthetic-program.ts";
export type {
  MappedCodeFragment,
  ProgramTransform,
  ProgramTransformRequest,
  RuntimeBindingsForTransform,
  SourcePosition,
} from "./types.ts";
