declare module "lingui-for-svelte/macro" {
  import type { MessagePlaceholder } from "@lingui/core/macro";

  export {
    defineMessage,
    msg,
    ph,
    plural,
    select,
    selectOrdinal,
  } from "@lingui/core/macro";

  type MacroMessageDescriptor = (
    | {
        id: string;
        message?: string;
      }
    | {
        id?: string;
        message: string;
      }
  ) & {
    comment?: string;
    context?: string;
  };

  /**
   * Translates a message descriptor
   *
   * @example
   * ```
   * import { t } from "lingui-for-svelte/macro";
   * const message = $derived($t({
   *   id: "msg.hello",
   *   comment: "Greetings at the homepage",
   *   message: `Hello ${{name}}`,
   * }));
   * ```
   *
   * @example
   * ```
   * import { t } from "lingui-for-svelte/macro";
   * const message = $derived($t({
   *   id: "msg.plural",
   *   message: $plural(value, { one: "...", other: "..." }),
   * }));
   * ```
   *
   * @param descriptor The message descriptor to translate
   */
  export function t(descriptor: MacroMessageDescriptor): string;

  /**
   * Translates a template string using the global I18n instance
   *
   * @example
   * ```
   * import { t } from "lingui-for-svelte/macro";
   * const message = $derived($t`Hello ${{name}}`);
   * ```
   */
  export function t(
    literals: TemplateStringsArray,
    ...placeholders: MessagePlaceholder[]
  ): string;

  export namespace t {
    /**
     * @private Enables use of this macro as a Svelte store. Do not use directly.
     */
    export function subscribe(run: (value: typeof t) => void): () => void;
  }
}
