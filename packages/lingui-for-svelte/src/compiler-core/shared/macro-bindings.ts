import type * as t from "@babel/types";

import {
  collectMacroImportLocals as collectSharedMacroImportLocals,
  expressionUsesMacroBinding as expressionUsesSharedMacroBinding,
  LINGUI_ALL_MACRO_IMPORTS,
  LINGUI_COMPONENT_MACRO_IMPORTS,
  LINGUI_DIRECT_STRING_MACRO_IMPORTS,
  parseMacroBindings as parseSharedMacroBindings,
  type SharedMacroBindings,
} from "lingui-for-shared/compiler";

import { getParserPlugins } from "./config.ts";
import { EAGER_TRANSLATION_PROPERTY, PACKAGE_MACRO } from "./constants.ts";
import type { ScriptLang } from "./types.ts";

type MacroImportName = (typeof LINGUI_ALL_MACRO_IMPORTS)[number];

export type MacroBindings = {
  all: ReadonlySet<string>;
  components: ReadonlySet<string>;
  reactiveStrings: ReadonlySet<string>;
  allImports: ReadonlyMap<string, MacroImportName>;
  componentImports: ReadonlyMap<string, MacroImportName>;
};

const REACTIVE_STRING_IMPORTS =
  LINGUI_DIRECT_STRING_MACRO_IMPORTS satisfies readonly MacroImportName[];

const COMPONENT_IMPORTS =
  LINGUI_COMPONENT_MACRO_IMPORTS satisfies readonly MacroImportName[];

const ALL_MACRO_IMPORTS =
  LINGUI_ALL_MACRO_IMPORTS satisfies readonly MacroImportName[];

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
      eagerPropertyName: EAGER_TRANSLATION_PROPERTY,
      reactiveAliasImports: bindings.reactiveStrings,
    },
  );
}
