import type { LinguiConfig } from "@lingui/conf";

import type { RuntimeWarningOptions } from "@lingui-for/internal-lingui-analyzer-wasm";

import type { RichTextWhitespaceMode } from "../compile/common/config.ts";

/**
 * Public configuration accepted by the lingui-for-svelte bundler plugin.
 */
export interface LinguiSveltePluginOptions {
  /**
   * Optional partial Lingui configuration forwarded to the compile pipeline so build
   * and dev transforms can share the same macro/extraction settings.
   */
  linguiConfig?: Partial<LinguiConfig> | undefined;
  /**
   * Additional package specifiers that should be treated as Svelte macro packages.
   */
  sveltePackages?: readonly string[] | undefined;
  /**
   * Whitespace handling mode for rich-text Component Macros during compilation.
   *
   * Use the same mode in extraction and build transforms so catalog entries stay consistent with
   * the emitted runtime code.
   *
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#svelte
   */
  whitespace?: RichTextWhitespaceMode | undefined;
  /**
   * Runtime warning configuration forwarded to the analyzer while transforming `.svelte` files.
   */
  runtimeWarnings?: RuntimeWarningOptions | undefined;
}
