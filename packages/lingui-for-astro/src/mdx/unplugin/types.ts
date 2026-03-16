import type { LinguiConfig } from "@lingui/conf";

/**
 * Options for the MDX Lingui transform plugin.
 *
 * Use this to override the Lingui config that is passed to MDX macro lowering
 * and extraction-related transforms for `.mdx` source files.
 */
export interface LinguiAstroMdxPluginOptions {
  /**
   * Partial Lingui config used while transforming `.mdx` files.
   */
  linguiConfig?: Partial<LinguiConfig> | undefined;
}
