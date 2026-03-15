import { parse, type TSESTree } from "@typescript-eslint/typescript-estree";
import MagicString from "magic-string";

import { basenamePath, dirnamePath, resolveRelativeSpecifier } from "./path.ts";
import type {
  FacadeBinding,
  FacadeDeclaration,
  ImportSpecifierNode,
  InputDeclaration,
  MarkupFacadeModule,
  RewriteMarkupImport,
  RewriteMarkupImportsResult,
  ScriptRange,
} from "./types.ts";

export function rewriteMarkupImports(
  source: string,
  filename: string,
  markupExtension: string,
  collectScriptRanges: (
    source: string,
    filename: string,
  ) => readonly ScriptRange[],
  rewriteImport: RewriteMarkupImport,
): RewriteMarkupImportsResult {
  const scripts = collectScriptRanges(source, filename);
  const string = new MagicString(source);
  let changed = false;

  for (const script of scripts) {
    const program = parseScript(script.content, script.lang);

    for (const statement of program.body) {
      const sourceNode =
        statement.type === "ImportDeclaration" ||
        statement.type === "ExportAllDeclaration" ||
        statement.type === "ExportNamedDeclaration"
          ? statement.source
          : null;

      if (!sourceNode?.range) {
        continue;
      }

      const nextSpecifier = rewriteImport(sourceNode.value, {
        filename,
        scriptKind: script.kind,
        markupExtension,
      });

      if (!nextSpecifier || nextSpecifier === sourceNode.value) {
        continue;
      }

      const [start, end] = sourceNode.range;
      const globalStart = script.contentStart + start;
      const globalEnd = script.contentStart + end;
      const quote = sourceNode.raw.startsWith("'") ? "'" : '"';

      string.overwrite(
        globalStart,
        globalEnd,
        `${quote}${nextSpecifier}${quote}`,
      );
      changed = true;
    }
  }

  return {
    code: changed ? string.toString() : source,
    changed,
  };
}

export function collectRelativeMarkupImports(
  source: string,
  filename: string,
  markupExtension: string,
  collectScriptRanges: (
    source: string,
    filename: string,
  ) => readonly ScriptRange[],
): readonly string[] {
  const imports = new Set<string>();

  for (const script of collectScriptRanges(source, filename)) {
    const program = parseScript(script.content, script.lang);

    for (const statement of program.body) {
      if (!isSupportedImportDeclaration(statement) || !statement.source) {
        continue;
      }

      const specifier = statement.source.value;
      if (specifier.startsWith(".") && specifier.endsWith(markupExtension)) {
        imports.add(specifier);
      }
    }
  }

  return [...imports];
}

export function createMarkupFacadeModule(
  source: string,
  filename: string,
  relativePath: string,
  markupExtension: string,
  collectScriptRanges: (
    source: string,
    filename: string,
  ) => readonly ScriptRange[],
): MarkupFacadeModule {
  const scripts = collectScriptRanges(source, filename);
  const string = new MagicString(source);
  const facadeDeclarations: FacadeDeclaration[] = [];
  let changed = false;
  let bindingCounter = 0;

  for (const script of scripts) {
    const program = parseScript(script.content, script.lang);

    for (const statement of program.body) {
      if (!isSupportedImportDeclaration(statement) || !statement.source) {
        continue;
      }

      const specifier = statement.source.value;
      if (!shouldExternalizeSpecifier(specifier, markupExtension)) {
        continue;
      }

      const replacement = createFacadeImportReplacement(
        statement,
        relativePath,
        markupExtension,
        bindingCounter,
      );
      bindingCounter = replacement.nextBindingCounter;

      const globalStart = script.contentStart + statement.range[0];
      const globalEnd = script.contentStart + statement.range[1];
      string.overwrite(globalStart, globalEnd, replacement.code);
      facadeDeclarations.push({
        source: toFacadeSourceSpecifier(filename, specifier),
        specifiers: replacement.facadeSpecifiers,
        sideEffectOnly: replacement.sideEffectOnly,
      });
      changed = true;
    }
  }

  if (!changed) {
    return {
      relativePath,
      filename,
      assetFileName: relativePath,
      facadeFileName: null,
      facadeCode: null,
      facadeDtsFileName: null,
      facadeDtsCode: null,
      rewrittenCode: source,
    };
  }

  return {
    relativePath,
    filename,
    assetFileName: relativePath,
    facadeFileName: relativePath.replace(
      new RegExp(`${escapeRegExp(markupExtension)}$`),
      `${markupExtension}.imports.mjs`,
    ),
    facadeCode: createFacadeModuleCode(facadeDeclarations, false),
    facadeDtsFileName: relativePath.replace(
      new RegExp(`${escapeRegExp(markupExtension)}$`),
      `${markupExtension}.imports.d.mts`,
    ),
    facadeDtsCode: createFacadeModuleCode(facadeDeclarations, true),
    rewrittenCode: string.toString(),
  };
}

function createFacadeImportReplacement(
  statement: InputDeclaration,
  relativePath: string,
  markupExtension: string,
  bindingCounter: number,
): {
  code: string;
  facadeSpecifiers: FacadeBinding[];
  nextBindingCounter: number;
  sideEffectOnly: boolean;
} {
  if (statement.type !== "ImportDeclaration") {
    return {
      code: statement.source ? statement.source.raw : "",
      facadeSpecifiers: [],
      nextBindingCounter: bindingCounter,
      sideEffectOnly: true,
    };
  }

  const facadeSpecifier = `./${basenamePath(relativePath).replace(
    new RegExp(`${escapeRegExp(markupExtension)}$`),
    `${markupExtension}.imports.mjs`,
  )}`;

  if (statement.specifiers.length === 0) {
    return {
      code: `import "${facadeSpecifier}";`,
      facadeSpecifiers: [],
      nextBindingCounter: bindingCounter,
      sideEffectOnly: true,
    };
  }

  const facadeSpecifiers = statement.specifiers.map((specifier) => {
    const exportName = `__unplugin_markup_import_${bindingCounter++}`;
    return createFacadeBinding(
      specifier,
      statement.importKind === "type",
      exportName,
    );
  });

  return {
    code: createFacadeImportStatement(facadeSpecifier, facadeSpecifiers),
    facadeSpecifiers,
    nextBindingCounter: bindingCounter,
    sideEffectOnly: false,
  };
}

function createFacadeBinding(
  specifier: ImportSpecifierNode,
  declarationTypeOnly: boolean,
  exportName: string,
): FacadeBinding {
  if (specifier.type === "ImportDefaultSpecifier") {
    return {
      exportName,
      importedName: "default",
      kind: "default",
      localName: specifier.local.name,
      typeOnly: false,
    };
  }

  if (specifier.type === "ImportNamespaceSpecifier") {
    return {
      exportName,
      importedName: null,
      kind: "namespace",
      localName: specifier.local.name,
      typeOnly: false,
    };
  }

  return {
    exportName,
    importedName:
      specifier.imported.type === "Identifier"
        ? specifier.imported.name
        : specifier.imported.value,
    kind: "named",
    localName: specifier.local.name,
    typeOnly: declarationTypeOnly || specifier.importKind === "type",
  };
}

function createFacadeImportStatement(
  facadeSpecifier: string,
  specifiers: readonly FacadeBinding[],
): string {
  const allTypeOnly = specifiers.every((specifier) => specifier.typeOnly);
  const renderedSpecifiers = specifiers.map((specifier) => {
    const prefix = allTypeOnly || !specifier.typeOnly ? "" : "type ";
    return `${prefix}${specifier.exportName} as ${specifier.localName}`;
  });

  const importKeyword = allTypeOnly ? "import type" : "import";
  return `${importKeyword} { ${renderedSpecifiers.join(", ")} } from "${facadeSpecifier}";`;
}

function createFacadeModuleCode(
  declarations: readonly FacadeDeclaration[],
  includeTypeOnly: boolean,
): string {
  const lines = declarations
    .flatMap((declaration) => {
      if (declaration.sideEffectOnly) {
        return [`import "${declaration.source}";`];
      }

      return declaration.specifiers.flatMap((specifier) => {
        if (specifier.kind === "default") {
          return `export { default as ${specifier.exportName} } from "${declaration.source}";`;
        }

        if (specifier.kind === "namespace") {
          return `export * as ${specifier.exportName} from "${declaration.source}";`;
        }

        if (specifier.typeOnly && !includeTypeOnly) {
          return [];
        }

        const prefix = specifier.typeOnly ? "export type" : "export";
        return `${prefix} { ${specifier.importedName} as ${specifier.exportName} } from "${declaration.source}";`;
      });
    })
    .join("\n");

  if (includeTypeOnly || lines.length > 0) {
    return lines;
  }

  return "export {};";
}

function toFacadeSourceSpecifier(
  sourceMarkupFilename: string,
  specifier: string,
): string {
  if (!specifier.startsWith(".")) {
    return specifier;
  }

  return resolveRelativeSpecifier(dirnamePath(sourceMarkupFilename), specifier);
}

function shouldExternalizeSpecifier(
  specifier: string,
  markupExtension: string,
): boolean {
  return specifier.startsWith(".") && !specifier.endsWith(markupExtension);
}

function isSupportedImportDeclaration(
  statement: TSESTree.ProgramStatement,
): statement is InputDeclaration {
  return (
    statement.type === "ImportDeclaration" ||
    statement.type === "ExportAllDeclaration" ||
    statement.type === "ExportNamedDeclaration"
  );
}

function parseScript(code: string, lang: "js" | "ts"): TSESTree.Program {
  return parse(code, {
    comment: false,
    jsx: false,
    loc: false,
    range: true,
    sourceType: "module",
    ...(lang === "ts" ? {} : { jsDocParsingMode: "none" }),
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
