import linguiMacro from "@lingui/core/macro";

const {
  defineMessage,
  msg,
  ph,
  plural: linguiPlural,
  select: linguiSelect,
  selectOrdinal: linguiSelectOrdinal,
  t: linguiT,
} = linguiMacro as typeof import("@lingui/core/macro");

export { defineMessage, msg, ph };

export const t = linguiT;
export const plural = linguiPlural;
export const select = linguiSelect;
export const selectOrdinal = linguiSelectOrdinal;

export interface TransProps {
  id?: string | undefined;
  comment?: string | undefined;
  context?: string | undefined;
  children?: unknown;
}

export const Trans = null as unknown as (props: TransProps) => unknown;

export interface PluralProps {
  value: number;
  offset?: number | undefined;
  zero?: string | undefined;
  one?: string | undefined;
  two?: string | undefined;
  few?: string | undefined;
  many?: string | undefined;
  other: string;
}

export const Plural = null as unknown as (props: PluralProps) => unknown;

export interface SelectProps {
  value: string;
  other: string;
  [key: `_${string}`]: string;
}

export const Select = null as unknown as (props: SelectProps) => unknown;

export interface SelectOrdinalProps {
  value: number;
  offset?: number | undefined;
  zero?: string | undefined;
  one?: string | undefined;
  two?: string | undefined;
  few?: string | undefined;
  many?: string | undefined;
  other: string;
}

export const SelectOrdinal = null as unknown as (
  props: SelectOrdinalProps,
) => unknown;

console.warn(
  "lingui-for-astro/macro is not meant to be used at runtime. If you see this warning, the macro transform did not run.",
);
