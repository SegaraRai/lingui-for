import {
  collectMacroImportLocals as collectSharedMacroImportLocals,
  expressionUsesMacroBinding as expressionUsesSharedMacroBinding,
  parseMacroBindings as parseSharedMacroBindings,
  type SharedMacroBindings,
} from "lingui-for-shared/compiler";
import type * as t from "@babel/types";

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
  allImports: ReadonlyMap<string, MacroImportName>;
  componentImports: ReadonlyMap<string, MacroImportName>;
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

function isReactiveStringImportName(
  importedName: MacroImportName,
): importedName is (typeof REACTIVE_STRING_IMPORTS)[number] {
  return REACTIVE_STRING_IMPORTS.includes(
    importedName as (typeof REACTIVE_STRING_IMPORTS)[number],
  );
}

function toBindings(
  bindings: SharedMacroBindings<MacroImportName>,
): MacroBindings {
  return {
    all: bindings.all,
    components: bindings.components,
    reactiveStrings: new Set(
      [...bindings.allImports.entries()]
        .filter(([, importedName]) => isReactiveStringImportName(importedName))
        .map(([localName]) => localName),
    ),
    allImports: bindings.allImports,
    componentImports: bindings.componentImports,
  };
}

export function collectMacroImportLocals(
  program: t.Program,
  importedNames: readonly MacroImportName[],
): ReadonlySet<string> {
  return collectSharedMacroImportLocals(program, {
    macroPackage: PACKAGE_MACRO,
    importedNames,
  });
}

export function parseMacroBindings(
  code: string,
  lang: ScriptLang,
): MacroBindings {
  return toBindings(
    parseSharedMacroBindings(code, {
      parserPlugins: getParserPlugins(lang),
      macroPackage: PACKAGE_MACRO,
      allMacroImports: ALL_MACRO_IMPORTS,
      componentImports: COMPONENT_IMPORTS,
    }),
  );
}

export function expressionUsesMacroBinding(
  source: string,
  lang: ScriptLang,
  bindings: MacroBindings,
): boolean {
  return expressionUsesSharedMacroBinding(
    source,
    {
      all: bindings.all,
      components: bindings.components,
      allImports: bindings.allImports,
      componentImports: bindings.componentImports,
    } as SharedMacroBindings<MacroImportName>,
    {
      parserPlugins: getParserPlugins(lang),
      macroPackage: PACKAGE_MACRO,
      eagerPropertyName: "eager",
      reactiveAliasImports: bindings.reactiveStrings,
    },
  );
}
