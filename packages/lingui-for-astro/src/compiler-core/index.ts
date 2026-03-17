export { normalizeLinguiConfig } from "./shared/config.ts";
export { mayContainLinguiMacroImport } from "./shared/macro-presence.ts";
export { stripQuery } from "./shared/paths.ts";
export type { LinguiAstroTransformOptions } from "./shared/types.ts";
export {
  createAstroExtractionUnits,
  transformAstro,
} from "./transform/index.ts";
