import type { LinguiConfigSource } from "@lingui-for/framework-core/config";

/**
 * Public configuration accepted by the lingui-for-svelte bundler plugin.
 */
export interface LinguiSveltePluginOptions {
  /**
   * Optional Lingui config source. Omit this to let the plugin discover `lingui.config.*` from
   * the project root once during plugin setup.
   */
  config?: LinguiConfigSource;
}
