import { parseSync, type NodePath, type ParserOptions } from "@babel/core";
import * as t from "@babel/types";

import { getBabelTraverse } from "./babel-traverse.ts";

export type SharedMacroBindings<ImportName extends string> = {
  all: ReadonlySet<string>;
  components: ReadonlySet<string>;
  allImports: ReadonlyMap<string, ImportName>;
  componentImports: ReadonlyMap<string, ImportName>;
};

function isImportedName<ImportName extends string>(
  value: string,
  importedNames: readonly ImportName[],
): value is ImportName {
  return importedNames.includes(value as ImportName);
}

function parseFile(
  code: string,
  parserPlugins: NonNullable<ParserOptions["plugins"]>,
  swallowParseErrors: boolean,
): t.File | null {
  let parsed: ReturnType<typeof parseSync>;
  try {
    parsed = parseSync(code, {
      ast: true,
      babelrc: false,
      code: false,
      configFile: false,
      parserOpts: {
        sourceType: "module",
        plugins: parserPlugins,
      },
    });
  } catch (error) {
    if (swallowParseErrors) {
      return null;
    }
    throw error;
  }

  return parsed && t.isFile(parsed) ? parsed : null;
}

function collectImportLocalsFromFile<ImportName extends string>(
  file: t.File,
  options: {
    readonly macroPackage: string;
    readonly importedNames: readonly ImportName[];
  },
): Map<string, ImportName> {
  const locals = new Map<string, ImportName>();
  const traverse = getBabelTraverse();

  traverse(file, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      if (path.node.source.value !== options.macroPackage) {
        return;
      }

      path.node.specifiers.forEach((specifier) => {
        if (
          !t.isImportSpecifier(specifier) ||
          !t.isIdentifier(specifier.imported) ||
          !isImportedName(specifier.imported.name, options.importedNames)
        ) {
          return;
        }

        locals.set(specifier.local.name, specifier.imported.name);
      });
    },
  });

  return locals;
}

export function collectMacroImportLocals<ImportName extends string>(
  program: t.Program,
  options: {
    readonly macroPackage: string;
    readonly importedNames: readonly ImportName[];
  },
): ReadonlySet<string> {
  return new Set(collectImportLocalsFromFile(t.file(program), options).keys());
}

export function parseMacroBindings<ImportName extends string>(
  code: string,
  options: {
    readonly parserPlugins: NonNullable<ParserOptions["plugins"]>;
    readonly macroPackage: string;
    readonly allMacroImports: readonly ImportName[];
    readonly componentImports: readonly ImportName[];
    readonly swallowParseErrors?: boolean;
  },
): SharedMacroBindings<ImportName> {
  const file = parseFile(
    code,
    options.parserPlugins,
    options.swallowParseErrors ?? false,
  );
  if (!file) {
    return {
      all: new Set<string>(),
      components: new Set<string>(),
      allImports: new Map<string, ImportName>(),
      componentImports: new Map<string, ImportName>(),
    };
  }

  const allImports = collectImportLocalsFromFile(file, {
    macroPackage: options.macroPackage,
    importedNames: options.allMacroImports,
  });
  const componentImports = collectImportLocalsFromFile(file, {
    macroPackage: options.macroPackage,
    importedNames: options.componentImports,
  });

  return {
    all: new Set(allImports.keys()),
    components: new Set(componentImports.keys()),
    allImports,
    componentImports,
  };
}

function createSyntheticExpressionFile<ImportName extends string>(
  source: string,
  bindings: SharedMacroBindings<ImportName>,
  options: {
    readonly parserPlugins: NonNullable<ParserOptions["plugins"]>;
    readonly macroPackage: string;
    readonly swallowParseErrors: boolean;
  },
): t.File | null {
  const syntheticImports = [...bindings.allImports.entries()]
    .map(([localName, importedName]) =>
      importedName === localName
        ? `import { ${importedName} } from "${options.macroPackage}";\n`
        : `import { ${importedName} as ${localName} } from "${options.macroPackage}";\n`,
    )
    .join("");

  return parseFile(
    `${syntheticImports}const __lingui_for_expr__ = (\n${source}\n);`,
    options.parserPlugins,
    options.swallowParseErrors,
  );
}

function isMacroImportBinding(
  binding: ReturnType<NodePath<t.Identifier>["scope"]["getBinding"]>,
  options: {
    readonly allowedLocals: ReadonlySet<string>;
    readonly macroPackage: string;
  },
): boolean {
  if (!binding || !options.allowedLocals.has(binding.identifier.name)) {
    return false;
  }

  if (!binding.path.isImportSpecifier()) {
    return false;
  }

  const importDeclaration = binding.path.parentPath;
  return (
    importDeclaration?.isImportDeclaration() === true &&
    importDeclaration.node.source.value === options.macroPackage
  );
}

function pathUsesMacroBinding<ImportName extends string>(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  bindings: SharedMacroBindings<ImportName>,
  options: {
    readonly macroPackage: string;
    readonly eagerPropertyName?: string;
    readonly reactiveAliasImports?: ReadonlySet<string>;
  },
): boolean {
  let macroBinding: NodePath<t.Identifier> | null = null;
  let reactiveAlias: NodePath<t.Identifier> | null = null;

  if (path.isCallExpression()) {
    const nextCallee = path.get("callee");
    if (nextCallee.isIdentifier()) {
      macroBinding = nextCallee;
      reactiveAlias = nextCallee;
    } else if (
      options.eagerPropertyName &&
      nextCallee.isMemberExpression() &&
      !nextCallee.node.computed &&
      nextCallee
        .get("property")
        .isIdentifier({ name: options.eagerPropertyName })
    ) {
      const object = nextCallee.get("object");
      if (object.isIdentifier()) {
        macroBinding = object;
      }
    }
  } else if (path.isTaggedTemplateExpression()) {
    const nextTag = path.get("tag");
    if (nextTag.isIdentifier()) {
      macroBinding = nextTag;
      reactiveAlias = nextTag;
    } else if (
      options.eagerPropertyName &&
      nextTag.isMemberExpression() &&
      !nextTag.node.computed &&
      nextTag.get("property").isIdentifier({ name: options.eagerPropertyName })
    ) {
      const object = nextTag.get("object");
      if (object.isIdentifier()) {
        macroBinding = object;
      }
    }
  }

  if (!macroBinding) {
    return false;
  }

  if (
    isMacroImportBinding(
      macroBinding.scope.getBinding(macroBinding.node.name),
      {
        allowedLocals: bindings.all,
        macroPackage: options.macroPackage,
      },
    )
  ) {
    return true;
  }

  if (!reactiveAlias || !options.reactiveAliasImports) {
    return false;
  }

  const localName = reactiveAlias.node.name;
  if (
    !localName.startsWith("$") ||
    !options.reactiveAliasImports.has(localName.slice(1)) ||
    reactiveAlias.scope.hasBinding(localName)
  ) {
    return false;
  }

  const baseBinding = reactiveAlias.scope.getBinding(localName.slice(1));
  return isMacroImportBinding(baseBinding, {
    allowedLocals: options.reactiveAliasImports,
    macroPackage: options.macroPackage,
  });
}

export function expressionUsesMacroBinding<ImportName extends string>(
  source: string,
  bindings: SharedMacroBindings<ImportName>,
  options: {
    readonly parserPlugins: NonNullable<ParserOptions["plugins"]>;
    readonly macroPackage: string;
    readonly swallowParseErrors?: boolean;
    readonly eagerPropertyName?: string;
    readonly reactiveAliasImports?: ReadonlySet<string>;
  },
): boolean {
  if (bindings.all.size === 0) {
    return false;
  }

  const file = createSyntheticExpressionFile(source, bindings, {
    parserPlugins: options.parserPlugins,
    macroPackage: options.macroPackage,
    swallowParseErrors: options.swallowParseErrors ?? false,
  });
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

      if (pathUsesMacroBinding(path, bindings, options)) {
        usesMacroBinding = true;
        path.stop();
      }
    },
    TaggedTemplateExpression(path: NodePath<t.TaggedTemplateExpression>) {
      if (usesMacroBinding) {
        path.stop();
        return;
      }

      if (pathUsesMacroBinding(path, bindings, options)) {
        usesMacroBinding = true;
        path.stop();
      }
    },
  });

  return usesMacroBinding;
}
