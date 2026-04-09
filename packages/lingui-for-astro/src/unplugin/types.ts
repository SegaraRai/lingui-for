import type { LinguiConfigSource } from "@lingui-for/internal-shared-compile";

/**
 * Options for the core `.astro` Lingui transform plugin.
 *
 * Use this to override the Lingui config that is passed to macro lowering
 * and extraction-related transforms for Astro source files.
 */
export interface LinguiAstroPluginOptions {
  /**
   * Optional Lingui config source. Omit this to let the plugin discover `lingui.config.*` from
   * the project root once during plugin setup.
   */
  config?: LinguiConfigSource;
}
