import {
  PACKAGE_MACRO,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../shared/constants.ts";

export const EXPR_PREFIX = "const __expr = (\n";
export const WRAPPED_SUFFIX = "\n);";

export function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}

export function createSyntheticMacroImports(
  bindings: ReadonlyMap<string, string>,
): string {
  if (bindings.size === 0) {
    return "";
  }

  return [...bindings.entries()]
    .map(([localName, importedName]) =>
      importedName === localName
        ? `import { ${importedName} } from "${PACKAGE_MACRO}";\n`
        : `import { ${importedName} as ${localName} } from "${PACKAGE_MACRO}";\n`,
    )
    .join("");
}

export function createComponentWrapperPrefix(
  bindings: ReadonlyMap<string, string>,
): string {
  return `${createSyntheticMacroImports(bindings)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n`;
}
