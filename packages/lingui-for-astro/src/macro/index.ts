export {
  defineMessage,
  msg,
  ph,
  plural,
  select,
  selectOrdinal,
  t,
} from "@lingui/core/macro";

/**
 * Props accepted by the macro-only `<Trans>` component.
 *
 * The component is compiled away and replaced with runtime translation code, so these props only
 * exist at authoring time.
 */
export interface TransProps {
  /**
   * Explicit message id to use instead of an auto-generated id.
   */
  id?: string | undefined;
  /**
   * Translator comment that is included in extracted catalog metadata.
   */
  comment?: string | undefined;
  /**
   * Optional message context used to disambiguate otherwise identical strings.
   */
  context?: string | undefined;
  /**
   * Rich-text content to translate. Text and embedded elements are compiled into a Lingui message.
   */
  children?: unknown;
}

/**
 * Macro-only rich-text translation component.
 *
 * Write translated markup as children, for example `<Trans>Hello <strong>{name}</strong></Trans>`.
 * The component does not run at runtime; it is replaced during compilation.
 */
export const Trans = null as unknown as (props: TransProps) => unknown;

/**
 * Props accepted by the macro-only `<Plural>` component.
 */
export interface PluralProps {
  /**
   * Numeric value that selects the plural branch and is exposed as `#` in the message.
   */
  value: number;
  /**
   * Optional ICU plural offset.
   */
  offset?: number | undefined;
  /**
   * Message used when the value is exactly zero.
   */
  zero?: string | undefined;
  /**
   * Message used for the `one` plural category.
   */
  one?: string | undefined;
  /**
   * Message used for the `two` plural category.
   */
  two?: string | undefined;
  /**
   * Message used for the `few` plural category.
   */
  few?: string | undefined;
  /**
   * Message used for the `many` plural category.
   */
  many?: string | undefined;
  /**
   * Fallback message used for any value not matched by a more specific plural category.
   */
  other: string;
}

/**
 * Macro-only ICU plural component.
 *
 * Use this when plural branches read more naturally in markup than in a function call.
 */
export const Plural = null as unknown as (props: PluralProps) => unknown;

/**
 * Props accepted by the macro-only `<Select>` component.
 */
export interface SelectProps {
  /**
   * Value used to choose a branch.
   */
  value: string;
  /**
   * Fallback branch used when no named case matches.
   */
  other: string;
  /**
   * Named select cases. Case names are written as `_caseName`, for example `_female="She"`.
   */
  [key: `_${string}`]: string;
}

/**
 * Macro-only ICU select component.
 *
 * Provide named cases as props prefixed with `_`, plus an `other` fallback.
 */
export const Select = null as unknown as (props: SelectProps) => unknown;

/**
 * Props accepted by the macro-only `<SelectOrdinal>` component.
 */
export interface SelectOrdinalProps {
  /**
   * Numeric value that selects the ordinal branch and is exposed as `#` in the message.
   */
  value: number;
  /**
   * Optional ICU ordinal offset.
   */
  offset?: number | undefined;
  /**
   * Message used when the value is exactly zero.
   */
  zero?: string | undefined;
  /**
   * Message used for the `one` ordinal category.
   */
  one?: string | undefined;
  /**
   * Message used for the `two` ordinal category.
   */
  two?: string | undefined;
  /**
   * Message used for the `few` ordinal category.
   */
  few?: string | undefined;
  /**
   * Message used for the `many` ordinal category.
   */
  many?: string | undefined;
  /**
   * Fallback message used for any value not matched by a more specific ordinal category.
   */
  other: string;
}

/**
 * Macro-only ICU ordinal-select component.
 *
 * This is the component form of `selectOrdinal(...)`, useful when ordinal branches are easier to
 * express as markup props.
 */
export const SelectOrdinal = null as unknown as (
  props: SelectOrdinalProps,
) => unknown;

console.warn(
  "lingui-for-astro/macro is not meant to be used at runtime. If you see this warning, the macro transform did not run.",
);
