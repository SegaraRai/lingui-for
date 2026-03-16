import type { LinguiConfig } from "@lingui/conf";

/**
 * Options for the core `.astro` Lingui transform plugin.
 *
 * Use this to override the Lingui config that is passed to macro lowering
 * and extraction-related transforms for Astro source files.
 */
export interface LinguiAstroPluginOptions {
  /**
   * Partial Lingui config used while transforming `.astro` files.
   */
  linguiConfig?: Partial<LinguiConfig> | undefined;
}
