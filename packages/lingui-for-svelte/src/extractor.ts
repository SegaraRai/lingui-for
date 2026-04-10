import type { LinguiSvelteFrameworkConfig } from "./config.ts";

export { svelteExtractor } from "./compile/extractor/index.ts";

declare module "@lingui-for/framework-core/config" {
  interface LinguiForFrameworkRegistry {
    /**
     * Framework-specific configuration for Svelte.
     */
    svelte: LinguiSvelteFrameworkConfig;
  }
}
