import { parseSync, type NodePath } from "@babel/core";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { getParserPlugins } from "./config.ts";
import { MACRO_PACKAGE } from "./constants.ts";
import type { ScriptLang } from "./types.ts";

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

type MacroBindings = {
  all: Set<string>;
  components: Set<string>;
  reactiveStrings: Set<string>;
};

const REACTIVE_STRING_IMPORTS = [
  "t",
  "plural",
  "select",
  "selectOrdinal",
] as const;
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
  ...REACTIVE_STRING_IMPORTS,
] as const satisfies readonly MacroImportName[];

function createEmptyBindings(): MacroBindings {
  return {
    all: new Set<string>(),
    components: new Set<string>(),
    reactiveStrings: new Set<string>(),
  };
}

function parseFile(code: string, lang: ScriptLang): t.File | null {
  const parsed = parseSync(code, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(lang),
    },
  });

  return t.isFile(parsed) ? parsed : null;
}

function collectImportLocalsFromFile(
  file: t.File,
  importedNames: readonly MacroImportName[],
): Set<string> {
  const locals = new Set<string>();

  traverse(file, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      if (path.node.source.value !== MACRO_PACKAGE) {
        return;
      }

      path.node.specifiers.forEach((specifier: t.ImportDeclaration["specifiers"][number]) => {
        if (
          !t.isImportSpecifier(specifier) ||
          !t.isIdentifier(specifier.imported) ||
          !importedNames.includes(specifier.imported.name as MacroImportName)
        ) {
          return;
        }

        locals.add(specifier.local.name);
      });
    },
  });

  return locals;
}

export function collectMacroImportLocals(
  program: t.Program,
  importedNames: readonly MacroImportName[],
): Set<string> {
  return collectImportLocalsFromFile(t.file(program), importedNames);
}

export function parseMacroBindings(
  code: string,
  lang: ScriptLang,
): MacroBindings {
  const file = parseFile(code, lang);
  if (!file) {
    return createEmptyBindings();
  }

  return {
    all: collectImportLocalsFromFile(file, ALL_MACRO_IMPORTS),
    components: collectImportLocalsFromFile(file, COMPONENT_IMPORTS),
    reactiveStrings: collectImportLocalsFromFile(file, REACTIVE_STRING_IMPORTS),
  };
}

function createSyntheticExpressionFile(
  source: string,
  lang: ScriptLang,
  bindings: MacroBindings,
): t.File | null {
  const syntheticImports = [...bindings.all]
    .map((localName) => `import { ${localName} } from "${MACRO_PACKAGE}";`)
    .join("\n");

  return parseFile(
    `${syntheticImports}\nconst __lingui_for_svelte_expr__ = (\n${source}\n);`,
    lang,
  );
}

function isMacroImportBinding(
  binding: ReturnType<NodePath<t.Identifier>["scope"]["getBinding"]>,
  allowedLocals: ReadonlySet<string>,
): boolean {
  if (!binding || !allowedLocals.has(binding.identifier.name)) {
    return false;
  }

  if (!binding?.path.isImportSpecifier()) {
    return false;
  }

  const importDeclaration = binding.path.parentPath;
  return (
    importDeclaration?.isImportDeclaration() === true &&
    importDeclaration.node.source.value === MACRO_PACKAGE
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

  if (
    isMacroImportBinding(callee.scope.getBinding(callee.node.name), bindings.all)
  ) {
    return true;
  }

  const localName = callee.node.name;
  if (
    !localName.startsWith("$") ||
    !bindings.reactiveStrings.has(localName.slice(1)) ||
    callee.scope.hasBinding(localName)
  ) {
    return false;
  }

  const baseBinding = callee.scope.getBinding(localName.slice(1));
  return isMacroImportBinding(baseBinding, bindings.reactiveStrings);
}

export function expressionUsesMacroBinding(
  source: string,
  lang: ScriptLang,
  bindings: MacroBindings,
): boolean {
  if (bindings.all.size === 0) {
    return false;
  }

  const file = createSyntheticExpressionFile(source, lang, bindings);
  if (!file) {
    return false;
  }

  let usesMacroBinding = false;

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
