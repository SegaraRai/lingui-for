export { normalizeLinguiConfig } from "./shared/config.ts";
export { isTransformableScript } from "./shared/paths.ts";
export type {
  ExtractionUnit,
  LinguiSvelteTransformOptions,
} from "./shared/types.ts";
export {
  createExtractionUnits,
  transformJavaScriptMacros,
  transformSvelte,
} from "./transform/index.ts";
