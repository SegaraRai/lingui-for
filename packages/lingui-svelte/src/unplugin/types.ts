import type { LinguiConfig } from "@lingui/conf";

/**
 * Public configuration accepted by the lingui-for-svelte bundler plugin.
 *
 * @property linguiConfig Optional partial Lingui configuration forwarded to compiler-core so build
 * and dev transforms can share the same macro/extraction settings.
 */
export interface LinguiSveltePluginOptions {
  linguiConfig?: Partial<LinguiConfig> | undefined;
}
