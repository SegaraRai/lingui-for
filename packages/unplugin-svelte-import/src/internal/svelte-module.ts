import { parse, type TSESTree } from "@typescript-eslint/typescript-estree";
import MagicString from "magic-string";
import { parse as parseSvelte } from "svelte/compiler";

import { basenamePath, dirnamePath, resolveRelativeSpecifier } from "./path.ts";
import type {
  FacadeBinding,
  FacadeDeclaration,
  ImportSpecifierNode,
  InputDeclaration,
  RewriteSvelteImport,
  RewriteSvelteImportsResult,
  ScriptRange,
  SvelteFacadeModule,
} from "./types.ts";

/**
 * Rewrites import and export specifiers inside `<script>` blocks of a Svelte
 * source file.
 *
 * This is a low-level helper that applies a caller-provided specifier mapping
 * without making any assumptions about bundler integration.
 */
export function rewriteSvelteImports(
  source: string,
  filename: string,
  rewriteImport: RewriteSvelteImport,
): RewriteSvelteImportsResult {
  const scripts = collectScripts(source, filename);
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

/**
 * Collects direct relative `.svelte` imports referenced from instance and
 * module `<script>` blocks.
 *
 * The returned specifiers are left as-written in the source so callers can
 * resolve them relative to the current file as needed.
 */
export function collectRelativeSvelteImports(
  source: string,
  filename: string,
): readonly string[] {
  const imports = new Set<string>();

  for (const script of collectScripts(source, filename)) {
    const program = parseScript(script.content, script.lang);

    for (const statement of program.body) {
      if (!isSupportedImportDeclaration(statement)) {
        continue;
      }

      if (!statement.source) {
        continue;
      }

      const specifier = statement.source.value;
      if (specifier.startsWith(".") && specifier.endsWith(".svelte")) {
        imports.add(specifier);
      }
    }
  }

  return [...imports];
}

/**
 * Builds the rewritten emitted `.svelte` source plus its companion facade
 * modules for a single Svelte file.
 *
 * Relative non-Svelte imports are redirected to a generated
 * `*.svelte.imports.mjs` facade so the original `.svelte` file can be shipped
 * alongside bundled JavaScript output.
 */
export function createSvelteFacadeModule(
  source: string,
  filename: string,
  relativePath: string,
): SvelteFacadeModule {
  const scripts = collectScripts(source, filename);
  const string = new MagicString(source);
  const facadeDeclarations: FacadeDeclaration[] = [];
  let changed = false;
  let bindingCounter = 0;

  for (const script of scripts) {
    const program = parseScript(script.content, script.lang);

    for (const statement of program.body) {
      if (!isSupportedImportDeclaration(statement)) {
        continue;
      }

      if (!statement.source) {
        continue;
      }

      const specifier = statement.source.value;
      if (!shouldExternalizeSpecifier(specifier)) {
        continue;
      }

      const replacement = createFacadeImportReplacement(
        statement,
        relativePath,
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
    facadeFileName: relativePath.replace(/\.svelte$/, ".svelte.imports.mjs"),
    facadeCode: createFacadeModuleCode(facadeDeclarations, false),
    facadeDtsFileName: relativePath.replace(
      /\.svelte$/,
      ".svelte.imports.d.mts",
    ),
    facadeDtsCode: createFacadeModuleCode(facadeDeclarations, true),
    rewrittenCode: string.toString(),
  };
}

function createFacadeImportReplacement(
  statement: InputDeclaration,
  relativePath: string,
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
    /\.svelte$/,
    ".svelte.imports.mjs",
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
    const exportName = `__unplugin_svelte_import_${bindingCounter++}`;
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
  sourceSvelteFilename: string,
  specifier: string,
): string {
  if (!specifier.startsWith(".")) {
    return specifier;
  }

  return resolveRelativeSpecifier(dirnamePath(sourceSvelteFilename), specifier);
}

function shouldExternalizeSpecifier(specifier: string): boolean {
  return specifier.startsWith(".") && !specifier.endsWith(".svelte");
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

function collectScripts(source: string, filename: string): ScriptRange[] {
  const ast = parseSvelte(source, { filename });
  const scripts: ScriptRange[] = [];

  if (ast.instance) {
    scripts.push(toScriptRange(source, ast.instance, "instance"));
  }

  if (ast.module) {
    scripts.push(toScriptRange(source, ast.module, "module"));
  }

  return scripts;
}

function toScriptRange(
  source: string,
  script: NonNullable<ReturnType<typeof parseSvelte>["instance"]>,
  kind: "instance" | "module",
): ScriptRange {
  const openEnd = source.indexOf(">", script.start) + 1;
  const closeStart = script.end - "</script>".length;
  const contentStart = openEnd + (source[openEnd] === "\n" ? 1 : 0);
  const content = source.slice(contentStart, closeStart);
  const openingTag = source.slice(script.start, openEnd);
  const langMatch = /\blang\s*=\s*["']([^"']+)["']/.exec(openingTag);
  const langValue = langMatch?.[1] ?? "";

  return {
    content,
    contentStart,
    kind,
    lang: langValue === "ts" ? "ts" : "js",
  };
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
