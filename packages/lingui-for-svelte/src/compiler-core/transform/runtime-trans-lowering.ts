import {
  PACKAGE_RUNTIME,
  SYNTHETIC_PREFIX_COMPONENT,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "../shared/constants.ts";
import type { MappedCodeFragment, ProgramTransform } from "./types.ts";

export {
  createMappedOutput,
  convertRuntimeTransJsxToMarkup as convertRuntimeTransJsxToSvelte,
} from "lingui-for-shared/compiler";

import { splitSyntheticDeclarations as splitSyntheticDeclarationsShared } from "lingui-for-shared/compiler";

export function splitSyntheticDeclarations(
  transformed: ProgramTransform,
  runtimeTransComponentName = "L4sRuntimeTrans",
): {
  script: MappedCodeFragment;
  expressionReplacements: Map<number, MappedCodeFragment>;
  componentReplacements: Map<number, MappedCodeFragment>;
} {
  return splitSyntheticDeclarationsShared(transformed, {
    runtimePackageName: PACKAGE_RUNTIME,
    runtimeTransComponentName,
    syntheticExpressionPrefix: SYNTHETIC_PREFIX_EXPRESSION,
    syntheticComponentPrefix: SYNTHETIC_PREFIX_COMPONENT,
    shouldRemoveRuntimeTransImport: (localName) =>
      localName === runtimeTransComponentName,
  });
}
