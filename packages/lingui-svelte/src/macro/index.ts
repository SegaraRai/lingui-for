import {
  plural as linguiPlural,
  select as linguiSelect,
  selectOrdinal as linguiSelectOrdinal,
  t as linguiT,
} from "@lingui/core/macro";
import type { Component, Snippet } from "svelte";
import type { Readable } from "svelte/store";

export { defineMessage, msg, ph } from "@lingui/core/macro";

function createReactiveMacro<TMacro extends (...args: never[]) => unknown>(
  macro: TMacro,
  name: string,
): Readable<TMacro> & TMacro {
  return Object.assign(macro as Readable<TMacro> & TMacro, {
    subscribe() {
      throw new Error(
        `lingui-for-svelte/macro "${name}" must be compiled before it can be subscribed to.`,
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

export const Trans = null as unknown as Component<{
  id?: string | undefined;
  comment?: string | undefined;
  context?: string | undefined;
  children?: Snippet | undefined;
}>;

export const Plural = null as unknown as Component<{
  value: number;
  offset?: number | undefined;
  zero?: string | undefined;
  one?: string | undefined;
  two?: string | undefined;
  few?: string | undefined;
  many?: string | undefined;
  other: string;
}>;

export const Select = null as unknown as Component<{
  value: string;
  other: string;
  [key: `_${string}`]: string;
}>;

export const SelectOrdinal = null as unknown as Component<{
  value: number;
  offset?: number | undefined;
  zero?: string | undefined;
  one?: string | undefined;
  two?: string | undefined;
  few?: string | undefined;
  many?: string | undefined;
  other: string;
}>;

console.warn(
  "lingui-for-svelte/macro is not meant to be used at runtime. If you see this warning, it means that the macro was not compiled correctly. Please ensure that your build setup is configured to compile lingui-for-svelte/macro using the appropriate Babel plugin.",
);
