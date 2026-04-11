import type { RuntimeWarningOptions } from "@lingui-for/framework-core/compile";

import type { RichTextWhitespaceMode } from "./compile/common/config.ts";

export {
  defineConfig,
  type LinguiConfigSource,
  type LinguiForConfigObject,
  type LinguiForFrameworkConfig,
} from "@lingui-for/framework-core/config";

/**
 * Framework-specific config accepted under `framework.astro`.
 *
 * These settings control Astro-only compile behavior while keeping the Lingui config file as the
 * single source of truth for both generic Lingui options and framework extensions.
 */
export interface LinguiAstroFrameworkConfig {
  /**
   * Additional macro package names that should be treated like `lingui-for-astro/macro`.
   *
   * Use this when you wrap or re-export the Astro macro entrypoint under a custom package name.
   */
  packages?: readonly string[] | undefined;
  /**
   * Whitespace normalization mode for rich-text component macros in `.astro` files.
   *
   * `"astro"` selects Astro-aware behavior. Use `"jsx"` for JSX-compatible normalization.
   */
  whitespace?: RichTextWhitespaceMode | undefined;
  /**
   * Runtime warning switches emitted by generated Astro runtime helpers.
   *
   * This is primarily used to control diagnostics such as `Trans` content override warnings.
   */
  runtimeWarnings?: RuntimeWarningOptions | undefined;
}

declare module "@lingui-for/framework-core/config" {
  interface LinguiForFrameworkRegistry {
    /**
     * Framework-specific configuration for Astro.
     */
    astro: LinguiAstroFrameworkConfig;
  }
}
