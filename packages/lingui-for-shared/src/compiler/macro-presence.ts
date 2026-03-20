/**
 * Cheap source-level check used to skip framework transforms when the user-facing macro package is
 * clearly absent.
 */
export function mayContainLinguiMacroImport(
  source: string,
  packageMacro: string,
): boolean {
  return source.includes(packageMacro);
}
