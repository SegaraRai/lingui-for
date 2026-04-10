import type { LinguiAstroFrameworkConfig } from "./config.ts";

export {
  astroExtractor,
  type AstroExtractorOptions,
} from "./compile/extractor/index.ts";

declare module "@lingui-for/framework-core/config" {
  interface LinguiForFrameworkRegistry {
    /**
     * Framework-specific configuration for Astro.
     */
    astro: LinguiAstroFrameworkConfig;
  }
}
