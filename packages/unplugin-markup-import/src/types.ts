export type MarkupFramework = "astro" | "svelte";

/**
 * Options for the markup import facade plugin.
 *
 * The plugin scans shipped markup files under `sourceDir`, rewrites their
 * internal non-markup relative imports to generated facade modules, and emits
 * rewritten markup assets into the bundle output.
 */
export interface MarkupImportPluginOptions {
  /**
   * Project root used to resolve the default {@link sourceDir}.
   *
   * Defaults to `process.cwd()`.
   */
  rootDir?: string | undefined;

  /**
   * Source directory that contains the `.svelte` files to scan and rewrite.
   *
   * Defaults to `<rootDir>/src`.
   */
  sourceDir?: string | undefined;

  /**
   * Markup frameworks whose files should be preserved.
   *
   * Defaults to `["svelte"]` to keep the previous behavior.
   */
  frameworks?: readonly MarkupFramework[] | undefined;
}
