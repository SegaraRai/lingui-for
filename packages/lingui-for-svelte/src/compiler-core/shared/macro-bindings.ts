import type * as t from "@babel/types";

import {
  collectMacroImportLocals as collectSharedMacroImportLocals,
  LINGUI_ALL_MACRO_IMPORTS,
} from "lingui-for-shared/compiler";

import { PACKAGE_MACRO } from "./constants.ts";

type MacroImportName = (typeof LINGUI_ALL_MACRO_IMPORTS)[number];

export function collectMacroImportLocals(
  program: t.Program,
  importedNames: readonly MacroImportName[],
): ReadonlySet<string> {
  return collectSharedMacroImportLocals(program, {
    macroPackage: PACKAGE_MACRO,
    importedNames,
  });
}
