import { parseSync, type NodePath } from "@babel/core";
import * as t from "@babel/types";

import { getBabelTraverse } from "./babel-traverse.ts";
import { getParserPlugins } from "./config.ts";
import { PACKAGE_MACRO } from "./constants.ts";

type MacroImportName =
  | "Trans"
  | "Plural"
  | "Select"
  | "SelectOrdinal"
  | "defineMessage"
  | "msg"
  | "plural"
  | "select"
  | "selectOrdinal"
  | "t";

/**
 * Summary of imported lingui-for-astro macro bindings in a source file.
 */
export type MacroBindings = {
  /**
   * All locally bound Lingui macro identifiers imported in the current file.
   */
  all: ReadonlySet<string>;
  /**
   * Local identifiers bound to component macros such as `Trans` and `Plural`.
   */
  components: ReadonlySet<string>;
  /**
   * Mapping from local identifier to imported macro name for every detected macro import.
   */
  allImports: ReadonlyMap<string, MacroImportName>;
  /**
   * Mapping from local identifier to imported macro name for component macros only.
   */
  componentImports: ReadonlyMap<string, MacroImportName>;
};

const COMPONENT_IMPORTS = [
  "Trans",
  "Plural",
  "Select",
  "SelectOrdinal",
] as const;

const ALL_MACRO_IMPORTS = [
  ...COMPONENT_IMPORTS,
  "defineMessage",
  "msg",
  "plural",
  "select",
  "selectOrdinal",
  "t",
] as const satisfies readonly MacroImportName[];

function isMacroImportName(
  value: string,
  importedNames: readonly MacroImportName[],
): value is MacroImportName {
  return importedNames.includes(value as MacroImportName);
}

function parseFile(code: string): t.File | null {
  let parsed: ReturnType<typeof parseSync>;
  try {
    parsed = parseSync(code, {
      ast: true,
      babelrc: false,
      code: false,
      configFile: false,
      parserOpts: {
        sourceType: "module",
        plugins: getParserPlugins(),
      },
    });
  } catch {
    return null;
  }

  return parsed && t.isFile(parsed) ? parsed : null;
}

function collectImportLocalsFromFile(
  file: t.File,
  importedNames: readonly MacroImportName[],
): Map<string, MacroImportName> {
  const locals = new Map<string, MacroImportName>();
  const traverse = getBabelTraverse();

  traverse(file, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      if (path.node.source.value !== PACKAGE_MACRO) {
        return;
      }

      path.node.specifiers.forEach((specifier) => {
        if (
          !t.isImportSpecifier(specifier) ||
          !t.isIdentifier(specifier.imported) ||
          !isMacroImportName(specifier.imported.name, importedNames)
        ) {
          return;
        }

        locals.set(specifier.local.name, specifier.imported.name);
      });
    },
  });

  return locals;
}

/**
 * Parses a JS/TS module and summarizes its imported lingui-for-astro macro bindings.
 *
 * @param code Module source text to inspect.
 * @returns A `MacroBindings` summary containing all imported macros and the subset of component
 * macros.
 *
 * This is the first-stage import analysis used by Astro transforms before probing individual
 * expressions or component nodes.
 */
export function parseMacroBindings(code: string): MacroBindings {
  const file = parseFile(code);
  if (!file) {
    return {
      all: new Set<string>(),
      components: new Set<string>(),
      allImports: new Map<string, MacroImportName>(),
      componentImports: new Map<string, MacroImportName>(),
    };
  }

  const allImports = collectImportLocalsFromFile(file, ALL_MACRO_IMPORTS);
  const componentImports = collectImportLocalsFromFile(file, COMPONENT_IMPORTS);

  return {
    all: new Set(allImports.keys()),
    components: new Set(componentImports.keys()),
    allImports,
    componentImports,
  };
}

function createSyntheticExpressionFile(
  source: string,
  bindings: MacroBindings,
): t.File | null {
  const syntheticImports = [...bindings.allImports.entries()]
    .map(([localName, importedName]) =>
      importedName === localName
        ? `import { ${importedName} } from "${PACKAGE_MACRO}";`
        : `import { ${importedName} as ${localName} } from "${PACKAGE_MACRO}";`,
    )
    .join("\n");

  return parseFile(
    `${syntheticImports}\nconst __lingui_for_astro_expr__ = (\n${source}\n);`,
  );
}

function isMacroImportBinding(
  binding: ReturnType<NodePath<t.Identifier>["scope"]["getBinding"]>,
  allowedLocals: ReadonlySet<string>,
): boolean {
  if (!binding || !allowedLocals.has(binding.identifier.name)) {
    return false;
  }

  if (!binding.path.isImportSpecifier()) {
    return false;
  }

  const importDeclaration = binding.path.parentPath;
  return (
    importDeclaration?.isImportDeclaration() === true &&
    importDeclaration.node.source.value === PACKAGE_MACRO
  );
}

function pathUsesMacroBinding(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  bindings: MacroBindings,
): boolean {
  let callee: NodePath<t.Identifier> | null = null;

  if (path.isCallExpression()) {
    const nextCallee = path.get("callee");
    if (nextCallee.isIdentifier()) {
      callee = nextCallee;
    }
  } else if (path.isTaggedTemplateExpression()) {
    const nextTag = path.get("tag");
    if (nextTag.isIdentifier()) {
      callee = nextTag;
    }
  }

  if (!callee) {
    return false;
  }

  return isMacroImportBinding(
    callee.scope.getBinding(callee.node.name),
    bindings.all,
  );
}

/**
 * Checks whether an isolated expression references any imported lingui-for-astro macro binding.
 *
 * @param source Source text for a single expression.
 * @param bindings Macro import summary collected from the surrounding module.
 * @returns `true` if the expression contains a call or tagged template that resolves to one of
 * the imported macro bindings.
 *
 * The function synthesizes a temporary module that re-imports the known macro locals, parses it
 * with Babel, and traverses the resulting AST using scope-aware binding resolution. This avoids
 * false positives from shadowed locals or plain name matching.
 */
export function expressionUsesMacroBinding(
  source: string,
  bindings: MacroBindings,
): boolean {
  if (bindings.all.size === 0) {
    return false;
  }

  const file = createSyntheticExpressionFile(source, bindings);
  if (!file) {
    return false;
  }

  let usesMacroBinding = false;
  const traverse = getBabelTraverse();

  traverse(file, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (usesMacroBinding) {
        path.stop();
        return;
      }

      if (pathUsesMacroBinding(path, bindings)) {
        usesMacroBinding = true;
        path.stop();
      }
    },
    TaggedTemplateExpression(path: NodePath<t.TaggedTemplateExpression>) {
      if (usesMacroBinding) {
        path.stop();
        return;
      }

      if (pathUsesMacroBinding(path, bindings)) {
        usesMacroBinding = true;
        path.stop();
      }
    },
  });

  return usesMacroBinding;
}
