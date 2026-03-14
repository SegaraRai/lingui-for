import { parseSync } from "@babel/core";
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

type MacroBindings = {
  all: Set<string>;
  components: Set<string>;
  reactiveStrings: Set<string>;
};

function createEmptyBindings(): MacroBindings {
  return {
    all: new Set<string>(),
    components: new Set<string>(),
    reactiveStrings: new Set<string>(),
  };
}

function parseProgram(code: string, lang: ScriptLang): t.Program | null {
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

  return t.isFile(parsed) ? parsed.program : null;
}

export function collectMacroImportLocals(
  program: t.Program,
  importedNames: readonly MacroImportName[],
): Set<string> {
  const locals = new Set<string>();

  program.body.forEach((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== MACRO_PACKAGE
    ) {
      return;
    }

    statement.specifiers.forEach((specifier) => {
      if (
        !t.isImportSpecifier(specifier) ||
        !t.isIdentifier(specifier.imported) ||
        !importedNames.includes(specifier.imported.name as MacroImportName)
      ) {
        return;
      }

      locals.add(specifier.local.name);
    });
  });

  return locals;
}

export function parseMacroBindings(
  code: string,
  lang: ScriptLang,
): MacroBindings {
  const program = parseProgram(code, lang);
  if (!program) {
    return createEmptyBindings();
  }

  return {
    all: collectMacroImportLocals(program, ALL_MACRO_IMPORTS),
    components: collectMacroImportLocals(program, COMPONENT_IMPORTS),
    reactiveStrings: collectMacroImportLocals(program, REACTIVE_STRING_IMPORTS),
  };
}

function nodeUsesMacroBinding(
  node: t.Node | null | undefined,
  bindings: MacroBindings,
): boolean {
  if (!node) {
    return false;
  }

  if (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    (bindings.all.has(node.callee.name) ||
      (bindings.reactiveStrings.has(node.callee.name.slice(1)) &&
        node.callee.name.startsWith("$")))
  ) {
    return true;
  }

  if (
    t.isTaggedTemplateExpression(node) &&
    t.isIdentifier(node.tag) &&
    (bindings.all.has(node.tag.name) ||
      (bindings.reactiveStrings.has(node.tag.name.slice(1)) &&
        node.tag.name.startsWith("$")))
  ) {
    return true;
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      if (
        value.some(
          (child) =>
            child !== null &&
            typeof child === "object" &&
            "type" in child &&
            nodeUsesMacroBinding(child as t.Node, bindings),
        )
      ) {
        return true;
      }
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      nodeUsesMacroBinding(value as t.Node, bindings)
    ) {
      return true;
    }
  }

  return false;
}

export function expressionUsesMacroBinding(
  source: string,
  lang: ScriptLang,
  bindings: MacroBindings,
): boolean {
  if (bindings.all.size === 0) {
    return false;
  }

  const program = parseProgram(
    `const __lingui_svelte_expr__ = (\n${source}\n);`,
    lang,
  );
  if (!program) {
    return false;
  }

  const declaration = program.body[0];
  if (
    !t.isVariableDeclaration(declaration) ||
    declaration.declarations.length !== 1
  ) {
    return false;
  }

  const expression = declaration.declarations[0]?.init;
  return expression ? nodeUsesMacroBinding(expression, bindings) : false;
}
