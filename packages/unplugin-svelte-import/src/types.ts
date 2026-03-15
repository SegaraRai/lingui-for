/**
 * Options for the Svelte import facade plugin.
 *
 * The plugin scans `.svelte` files under `sourceDir`, rewrites their internal
 * non-Svelte relative imports to generated facade modules, and emits rewritten
 * `.svelte` assets into the bundle output.
 */
export interface SvelteImportPluginOptions {
  /**
   * Project root used to resolve the default {@link sourceDir}.
   *
   * Defaults to `process.cwd()`.
   */
  rootDir?: string;

  /**
   * Source directory that contains the `.svelte` files to scan and rewrite.
   *
   * Defaults to `<rootDir>/src`.
   */
  sourceDir?: string;
}
