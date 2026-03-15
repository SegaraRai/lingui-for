export {
  defineMessage,
  msg,
  ph,
  plural,
  select,
  selectOrdinal,
  t,
} from "@lingui/core/macro";

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
