import type { LinguiConfig } from "@lingui/conf";

import type { RichTextWhitespaceMode } from "../compile/transform/index.ts";

/**
 * Public configuration accepted by the lingui-for-svelte bundler plugin.
 */
export interface LinguiSveltePluginOptions {
  /**
   * Optional partial Lingui configuration forwarded to the compile pipeline so build
   * and dev transforms can share the same macro/extraction settings.
   */
  linguiConfig?: Partial<LinguiConfig> | undefined;
  whitespace?: RichTextWhitespaceMode | undefined;
}
