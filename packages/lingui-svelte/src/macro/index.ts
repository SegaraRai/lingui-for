import {
  plural as linguiPlural,
  select as linguiSelect,
  selectOrdinal as linguiSelectOrdinal,
  t as linguiT,
} from "@lingui/core/macro";
import type { Readable } from "svelte/store";

export { defineMessage, msg, ph } from "@lingui/core/macro";

export { Trans } from "../runtime/index.ts";

function createReactiveMacro<TMacro extends (...args: never[]) => unknown>(
  macro: TMacro,
  name: string,
): Readable<TMacro> & TMacro {
  return Object.assign(macro as Readable<TMacro> & TMacro, {
    subscribe() {
      throw new Error(
        `lingui-svelte/macro "${name}" must be compiled before it can be subscribed to.`,
      );
    },
  });
}

export const t = createReactiveMacro(linguiT, "t");
export const plural = createReactiveMacro(linguiPlural, "plural");
export const select = createReactiveMacro(linguiSelect, "select");
export const selectOrdinal = createReactiveMacro(
  linguiSelectOrdinal,
  "selectOrdinal",
);

console.warn(
  "lingui-svelte/macro is not meant to be used at runtime. If you see this warning, it means that the macro was not compiled correctly. Please ensure that your build setup is configured to compile lingui-svelte/macro using the appropriate Babel plugin.",
);
