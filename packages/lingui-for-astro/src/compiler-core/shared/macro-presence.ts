import { mayContainLinguiMacroImport as mayContainMacroImport } from "lingui-for-shared/compiler";

import { PACKAGE_MACRO } from "./constants.ts";

/**
 * Cheap source-level check used to skip Astro transforms when the user-facing
 * macro package is clearly absent.
 */
export function mayContainLinguiMacroImport(source: string): boolean {
  return mayContainMacroImport(source, PACKAGE_MACRO);
}
