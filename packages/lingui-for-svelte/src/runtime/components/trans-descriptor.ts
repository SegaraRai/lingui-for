import type { I18n, MessageOptions } from "@lingui/core";

/**
 * Translates the props accepted by `<RuntimeTrans>`.
 *
 * @param translate Active Lingui translate function used for reactive updates.
 * @param message Optional descriptor or default-message string.
 * @param values Runtime interpolation values.
 * @param id Optional explicit message id.
 * @param options Additional Lingui message options except `message`, which is derived internally.
 * @returns The translated string, or an empty string when neither `id` nor `message` is provided.
 */
export function translateRuntimeTrans(
  translate: I18n["_"],
  id: string,
  message?: string,
  values: Readonly<Record<string, unknown>> = {},
  options?: Omit<MessageOptions, "message">,
): string {
  if (message) {
    return translate(id, values, {
      ...options,
      message,
    });
  }

  return translate(id, values, options);
}
