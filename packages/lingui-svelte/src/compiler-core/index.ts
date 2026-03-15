export { normalizeLinguiConfig } from "./shared/config.ts";
export { isTransformableScript } from "./shared/paths.ts";
export type { LinguiSvelteTransformOptions } from "./shared/types.ts";
export {
  createExtractionUnits,
  transformJavaScriptMacros,
  transformSvelte,
} from "./transform/index.ts";
export type { ExtractionUnit } from "./transform/types.ts";
