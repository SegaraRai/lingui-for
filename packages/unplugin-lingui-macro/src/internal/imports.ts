import { parseSync, type ParserOptions, type StaticImport } from "oxc-parser";

function getOxcParserOptions(filename: string): ParserOptions {
  if (/\.[cm]?tsx?$/.test(filename)) {
    return {
      lang: /\.[cm]?tsx$/.test(filename) ? "tsx" : "ts",
      sourceType: "module",
    };
  }

  if (/\.[cm]?[jt]sx$/.test(filename)) {
    return { lang: "jsx", sourceType: "module" };
  }

  return { lang: "js", sourceType: "module" };
}

function completesImportStatement(line: string): boolean {
  const trimmedLine = line.trim();
  return (
    /^\s*import\s*["']/.test(line) ||
    /\bfrom\s*["']/.test(line) ||
    trimmedLine.endsWith('";') ||
    trimmedLine.endsWith("';") ||
    trimmedLine.endsWith('"') ||
    trimmedLine.endsWith("'")
  );
}

function extractLeadingImportBlock(code: string): string {
  const lines = code.split(/\r?\n/).filter(Boolean) ?? [];
  let importBlock = "";
  let inBlockComment = false;
  let collectingImport = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (collectingImport) {
      importBlock += line;
      if (completesImportStatement(line)) {
        collectingImport = false;
      }
      continue;
    }

    if (inBlockComment) {
      importBlock += line;
      if (trimmedLine.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmedLine === "" || trimmedLine.startsWith("//")) {
      importBlock += line;
      continue;
    }

    if (trimmedLine.startsWith("/*")) {
      importBlock += line;
      if (!trimmedLine.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    if (trimmedLine.startsWith("import")) {
      importBlock += line;
      if (!completesImportStatement(line)) {
        collectingImport = true;
      }
      continue;
    }

    break;
  }

  return importBlock;
}

function readStaticImports(code: string, filename: string): StaticImport[] {
  const result = parseSync(filename, code, getOxcParserOptions(filename));
  return result.module.staticImports;
}

function parseStaticImports(code: string, filename: string): StaticImport[] {
  try {
    return readStaticImports(code, filename);
  } catch (error) {
    if (!(error instanceof Error)) {
      return [];
    }

    const importBlock = extractLeadingImportBlock(code);
    if (importBlock.trim() === "") {
      return [];
    }

    try {
      return readStaticImports(importBlock, filename);
    } catch {
      return [];
    }
  }
}

export function hasImport(
  code: string,
  filename: string,
  packageNames: readonly string[],
): boolean {
  if (packageNames.length === 0 || !code.includes("import")) {
    return false;
  }

  const packageNameSet = new Set(packageNames);
  for (const parsedImport of parseStaticImports(code, filename)) {
    if (packageNameSet.has(parsedImport.moduleRequest.value)) {
      return true;
    }
  }

  return false;
}
