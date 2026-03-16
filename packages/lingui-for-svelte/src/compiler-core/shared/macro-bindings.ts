import { parseSync, type NodePath } from "@babel/core";
import * as t from "@babel/types";

import { getBabelTraverse } from "./babel-traverse.ts";
import { getParserPlugins } from "./config.ts";
import { PACKAGE_MACRO } from "./constants.ts";
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
  all: ReadonlySet<string>;
  components: ReadonlySet<string>;
  reactiveStrings: ReadonlySet<string>;
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

function isMacroImportName(
  value: string,
  importedNames: readonly MacroImportName[],
): value is MacroImportName {
  return importedNames.includes(value as MacroImportName);
}

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
): ReadonlySet<string> {
  const locals = new Set<string>();
  const traverse = getBabelTraverse();

  traverse(file, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      if (path.node.source.value !== PACKAGE_MACRO) {
        return;
      }

      path.node.specifiers.forEach(
        (specifier: t.ImportDeclaration["specifiers"][number]) => {
          if (
            !t.isImportSpecifier(specifier) ||
            !t.isIdentifier(specifier.imported) ||
            !isMacroImportName(specifier.imported.name, importedNames)
          ) {
            return;
          }

          locals.add(specifier.local.name);
        },
      );
    },
  });

  return locals;
}

/**
 * Collects local identifiers imported from the macro package for a selected set of macro names.
 *
 * @param program Babel program node representing a JS/TS module.
 * @param importedNames Macro export names to match, such as `t`, `msg`, or `Trans`.
 * @returns A set of local binding names, including aliases, that resolve to the requested macros.
 *
 * This is used when later transform stages need to know which identifiers in the current file
 * actually refer to lingui-for-svelte macros instead of coincidentally sharing the same name.
 */
export function collectMacroImportLocals(
  program: t.Program,
  importedNames: readonly MacroImportName[],
): ReadonlySet<string> {
  return collectImportLocalsFromFile(t.file(program), importedNames);
}

/**
 * Parses a JS/TS module and summarizes its imported lingui-for-svelte macro bindings.
 *
 * @param code Module source text to inspect.
 * @param lang Parser mode used for Babel (`"js"` or `"ts"`).
 * @returns A `MacroBindings` summary containing all imported macros, the imported component
 * macros, and the imported reactive string macros.
 *
 * This is the coarse-grained import analysis used by Svelte template probing. It does not
 * inspect individual expression bodies yet; it only records which macro locals exist in the
 * surrounding script so later checks can resolve usage precisely.
 */
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
    .map((localName) => `import { ${localName} } from "${PACKAGE_MACRO}";`)
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

  if (
    isMacroImportBinding(
      callee.scope.getBinding(callee.node.name),
      bindings.all,
    )
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

/**
 * Checks whether an isolated expression references any imported lingui-for-svelte macro binding.
 *
 * @param source Source text for a single expression, typically sliced from Svelte markup.
 * @param lang Parser mode used for Babel (`"js"` or `"ts"`).
 * @param bindings Macro import summary collected from the surrounding script.
 * @returns `true` if the expression contains a call or tagged template that resolves to one of
 * the imported macro bindings, including `$t`-style reactive aliases.
 *
 * The function synthesizes a temporary module that re-imports the known macro locals, parses it
 * with Babel, and traverses the resulting AST using scope-aware binding resolution. This allows
 * it to reject shadowed locals and avoid the false positives that a name-only scan would produce.
 */
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
