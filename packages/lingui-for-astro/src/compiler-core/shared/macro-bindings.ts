import {
  expressionUsesMacroBinding as expressionUsesSharedMacroBinding,
  parseMacroBindings as parseSharedMacroBindings,
  type SharedMacroBindings,
} from "lingui-for-shared/compiler";

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

export type MacroBindings = SharedMacroBindings<MacroImportName>;

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
