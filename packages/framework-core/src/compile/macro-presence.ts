/**
 * Cheap source-level check used to skip framework transforms when the user-facing macro package is
 * clearly absent.
 */
export function mayContainLinguiMacroImport(
  source: string,
  packageMacro: string | readonly string[],
): boolean {
  return (
    typeof packageMacro === "string" ? [packageMacro] : packageMacro
  ).some((specifier) => source.includes(specifier));
}
