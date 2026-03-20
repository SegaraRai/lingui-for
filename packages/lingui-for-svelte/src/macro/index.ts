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
): Readable<TMacro> & TMacro & { eager: TMacro } {
  return Object.assign(macro as Readable<TMacro> & TMacro & { eager: TMacro }, {
    subscribe() {
      throw new Error(
        `lingui-for-svelte/macro "${name}" must be compiled before it can be subscribed to.`,
      );
    },
    eager: macro,
  });
}

function createReactiveOnlyMacro<TMacro extends (...args: never[]) => unknown>(
  macro: TMacro,
  name: string,
): Readable<TMacro> & { eager: TMacro } {
  return {
    subscribe() {
      throw new Error(
        `lingui-for-svelte/macro "${name}" must be compiled before it can be subscribed to.`,
      );
    },
    eager: macro,
  };
}

/**
 * Translates a message into a string.
 *
 * In `.svelte` files this export also behaves like a readable store, which allows `$t(...)` and
 * `` $t`...` `` to participate in Svelte reactivity in markup and inside user-authored runes.
 * Use `t.eager(...)` or `` t.eager`...` `` when you explicitly need a non-reactive snapshot.
 *
 * @see https://lingui-for.roundtrip.dev/macros/t#svelte
 */
export const t = createReactiveOnlyMacro(linguiT, "t");

/**
 * Builds or translates an ICU plural message.
 *
 * Use `plural(...)` inside `t(...)`/`msg(...)` for nested ICU messages, or use `$plural(...)` in a
 * component markup or inside a user-authored rune to reactively produce the translated string
 * form. Use `plural.eager(...)` for an intentional non-reactive snapshot.
 *
 * @see https://lingui-for.roundtrip.dev/macros/plural#svelte
 */
export const plural = createReactiveMacro(linguiPlural, "plural");

/**
 * Builds or translates an ICU select message.
 *
 * Use `select(...)` inside `t(...)`/`msg(...)` for nested ICU messages, or use `$select(...)` in a
 * component markup or inside a user-authored rune to reactively produce the translated string
 * form. Use `select.eager(...)` for an intentional non-reactive snapshot.
 *
 * @see https://lingui-for.roundtrip.dev/macros/select#svelte
 */
export const select = createReactiveMacro(linguiSelect, "select");

/**
 * Builds or translates an ICU ordinal-select message.
 *
 * Use `selectOrdinal(...)` inside `t(...)`/`msg(...)` for nested ICU messages, or use
 * `$selectOrdinal(...)` in component markup or inside a user-authored rune to reactively produce
 * the translated string form. Use `selectOrdinal.eager(...)` for an intentional non-reactive
 * snapshot.
 *
 * @see https://lingui-for.roundtrip.dev/macros/select-ordinal#svelte
 */
export const selectOrdinal = createReactiveMacro(
  linguiSelectOrdinal,
  "selectOrdinal",
);

/**
 * Props accepted by the macro-only `<Trans>` component.
 *
 * The component is compiled away and replaced with runtime translation code, so these props only
 * exist at authoring time.
 *
 * @see https://lingui-for.roundtrip.dev/macros/trans-component#svelte
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
  children?: Snippet | undefined;
}

/**
 * Macro-only rich-text translation component.
 *
 * Write translated markup as children, for example `<Trans>Hello <strong>{name}</strong></Trans>`.
 * The component does not run at runtime; it is replaced during compilation.
 *
 * @see https://lingui-for.roundtrip.dev/macros/trans-component#svelte
 */
export const Trans = null as unknown as Component<TransProps>;

/**
 * Props accepted by the macro-only `<Plural>` component.
 *
 * @see https://lingui-for.roundtrip.dev/macros/plural-component#svelte
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
  /**
   * Exact match plural cases, written as props prefixed with `_`, for example `_0="No items"`, `_1="One item"`, etc.
   */
  [key: `_${number}`]: string;
}

/**
 * Macro-only ICU plural component.
 *
 * Use this when plural branches read more naturally in markup than in a function call.
 *
 * @see https://lingui-for.roundtrip.dev/macros/plural-component#svelte
 */
export const Plural = null as unknown as Component<PluralProps>;

/**
 * Props accepted by the macro-only `<Select>` component.
 *
 * @see https://lingui-for.roundtrip.dev/macros/select-component#svelte
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
 *
 * @see https://lingui-for.roundtrip.dev/macros/select-component#svelte
 */
export const Select = null as unknown as Component<SelectProps>;

/**
 * Props accepted by the macro-only `<SelectOrdinal>` component.
 *
 * @see https://lingui-for.roundtrip.dev/macros/select-ordinal-component#svelte
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
  /**
   * Exact match ordinal cases, written as props prefixed with `_`, for example `_1="First"`, `_2="Second"`, etc.
   */
  [key: `_${number}`]: string;
}

/**
 * Macro-only ICU ordinal-select component.
 *
 * This is the component form of `selectOrdinal(...)`, useful when ordinal branches are easier to
 * express as markup props.
 *
 * @see https://lingui-for.roundtrip.dev/macros/select-ordinal-component#svelte
 */
export const SelectOrdinal = null as unknown as Component<SelectOrdinalProps>;

console.warn(
  "lingui-for-svelte/macro is not meant to be used at runtime. If you see this warning, it means that the macro was not compiled correctly. Please ensure that your build setup is configured to compile lingui-for-svelte/macro using the appropriate Babel plugin.",
);
