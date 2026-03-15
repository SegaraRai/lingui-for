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

export type MacroBindings = {
  all: Set<string>;
  components: Set<string>;
  allImports: ReadonlyMap<string, MacroImportName>;
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
  let parsed: unknown;
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

  return t.isFile(parsed) ? parsed : null;
}

async function collectImportLocalsFromFile(
  file: t.File,
  importedNames: readonly MacroImportName[],
): Promise<Map<string, MacroImportName>> {
  const locals = new Map<string, MacroImportName>();
  const traverse = await getBabelTraverse();

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

export async function parseMacroBindings(code: string): Promise<MacroBindings> {
  const file = parseFile(code);
  if (!file) {
    return {
      all: new Set<string>(),
      components: new Set<string>(),
      allImports: new Map<string, MacroImportName>(),
      componentImports: new Map<string, MacroImportName>(),
    };
  }

  const allImports = await collectImportLocalsFromFile(file, ALL_MACRO_IMPORTS);
  const componentImports = await collectImportLocalsFromFile(
    file,
    COMPONENT_IMPORTS,
  );

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

export async function expressionUsesMacroBinding(
  source: string,
  bindings: MacroBindings,
): Promise<boolean> {
  if (bindings.all.size === 0) {
    return false;
  }

  const file = createSyntheticExpressionFile(source, bindings);
  if (!file) {
    return false;
  }

  let usesMacroBinding = false;
  const traverse = await getBabelTraverse();

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
