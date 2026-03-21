import {
  lowerSyntheticComponentDeclaration as lowerSyntheticComponentDeclarationShared,
  stripRuntimeTransImports as stripRuntimeTransImportsShared,
} from "lingui-for-shared/compiler";

import {
  PACKAGE_RUNTIME,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../shared/constants.ts";
import type { ProgramTransform } from "./types.ts";

export function lowerSyntheticComponentDeclaration(
  transformed: ProgramTransform,
  runtimeTransComponentName: string,
  options: {
    compact?: boolean;
  } = {},
): string {
  return lowerSyntheticComponentDeclarationShared(
    transformed,
    runtimeTransComponentName,
    SYNTHETIC_PREFIX_COMPONENT,
    options,
  );
}

export function stripRuntimeTransImports(
  program: ProgramTransform["ast"]["program"],
): void {
  stripRuntimeTransImportsShared(program, PACKAGE_RUNTIME);
}
