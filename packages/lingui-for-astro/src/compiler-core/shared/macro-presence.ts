import { PACKAGE_MACRO } from "./constants.ts";

/**
 * Cheap source-level check used to skip Astro transforms when the user-facing
 * macro package is clearly absent.
 */
export function mayContainLinguiMacroImport(source: string): boolean {
  return source.includes(PACKAGE_MACRO);
}
