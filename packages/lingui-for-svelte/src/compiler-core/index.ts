export { normalizeLinguiConfig } from "./shared/config.ts";
export { mayContainLinguiMacroImport } from "./shared/macro-presence.ts";
export type { LinguiSvelteTransformOptions } from "./shared/types.ts";
export { createExtractionUnits, transformSvelte } from "./transform/index.ts";
export type { ExtractionUnit } from "./transform/types.ts";
