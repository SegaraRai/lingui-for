import type { LinguiAstroFrameworkConfig } from "./compile/common/config.ts";

export {
  defineConfig,
  type LinguiConfigSource,
  type LinguiForConfigObject,
  type LinguiForFrameworkConfig,
} from "@lingui-for/framework-core/config";

export type { LinguiAstroFrameworkConfig } from "./compile/common/config.ts";

declare module "@lingui-for/framework-core/config" {
  interface LinguiForFrameworkRegistry {
    /**
     * Framework-specific configuration for Astro.
     */
    astro: LinguiAstroFrameworkConfig;
  }
}
