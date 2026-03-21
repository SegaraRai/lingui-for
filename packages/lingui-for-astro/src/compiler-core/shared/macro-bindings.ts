import {
  expressionUsesMacroBinding as expressionUsesSharedMacroBinding,
  LINGUI_ALL_MACRO_IMPORTS,
  LINGUI_COMPONENT_MACRO_IMPORTS,
  parseMacroBindings as parseSharedMacroBindings,
  type SharedMacroBindings,
} from "lingui-for-shared/compiler";

import { getParserPlugins } from "./config.ts";
import { PACKAGE_MACRO } from "./constants.ts";

type MacroImportName = (typeof LINGUI_ALL_MACRO_IMPORTS)[number];

export type MacroBindings = SharedMacroBindings<MacroImportName>;

const COMPONENT_IMPORTS =
  LINGUI_COMPONENT_MACRO_IMPORTS satisfies readonly MacroImportName[];

const ALL_MACRO_IMPORTS =
  LINGUI_ALL_MACRO_IMPORTS satisfies readonly MacroImportName[];

export function parseMacroBindings(code: string): MacroBindings {
  return parseSharedMacroBindings(code, {
    parserPlugins: getParserPlugins(),
    macroPackage: PACKAGE_MACRO,
    allMacroImports: ALL_MACRO_IMPORTS,
    componentImports: COMPONENT_IMPORTS,
    swallowParseErrors: true,
  });
}

export function expressionUsesMacroBinding(
  source: string,
  bindings: MacroBindings,
): boolean {
  return expressionUsesSharedMacroBinding(source, bindings, {
    parserPlugins: getParserPlugins(),
    macroPackage: PACKAGE_MACRO,
    swallowParseErrors: true,
  });
}
