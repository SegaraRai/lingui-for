import type { LinguiConfig } from "@lingui/conf";

import type { RuntimeWarningOptions } from "@lingui-for/internal-lingui-analyzer-wasm";

import type { RichTextWhitespaceMode } from "../compile/common/config.ts";

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
  /**
   * Additional package specifiers that should be treated as Astro macro packages.
   */
  astroPackages?: readonly string[] | undefined;
  /**
   * Whitespace handling mode for rich-text Component Macros during compilation.
   *
   * Use the same mode in extraction and build transforms so catalog entries stay consistent with
   * the emitted runtime code.
   *
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#astro
   */
  whitespace?: RichTextWhitespaceMode | undefined;
  /**
   * Runtime warning configuration forwarded to the analyzer while transforming `.astro` files.
   */
  runtimeWarnings?: RuntimeWarningOptions | undefined;
}
