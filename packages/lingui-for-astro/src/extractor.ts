import type { LinguiAstroFrameworkConfig } from "./config.ts";

export { astroExtractor } from "./compile/extractor/index.ts";

declare module "@lingui-for/framework-core/config" {
  interface LinguiForFrameworkRegistry {
    /**
     * Framework-specific configuration for Astro.
     */
    astro: LinguiAstroFrameworkConfig;
  }
}
