import type { I18n, MessageDescriptor, MessageOptions } from "@lingui/core";

/**
 * Merges runtime-provided values into an existing message descriptor.
 *
 * @param descriptor Base descriptor produced by a macro or caller.
 * @param values Additional runtime values that should override descriptor values when keys collide.
 * @returns A new descriptor with merged `values`.
 *
 * This helper exists for compiled runtime output and is not usually called directly from
 * application code.
 */
export function mergeRuntimeTransValues(
  descriptor: MessageDescriptor,
  values: Readonly<Record<string, unknown>> = {},
): MessageDescriptor {
  return {
    ...descriptor,
    values: {
      ...descriptor.values,
      ...values,
    },
  };
}

/**
 * Translates the props accepted by `<RuntimeTrans>`.
 *
 * @param i18n Active Lingui instance used for translation.
 * @param message Optional descriptor or default-message string.
 * @param values Runtime interpolation values.
 * @param id Optional explicit message id.
 * @param options Additional Lingui message options except `message`, which is derived internally.
 * @returns The translated string, or an empty string when neither `id` nor `message` is provided.
 *
 * This is a low-level runtime helper used by compiled macro output. Prefer `t`/`<Trans>` at
 * authoring time and let the compiler target this helper automatically.
 */
export function translateRuntimeTrans(
  i18n: I18n,
  message: MessageDescriptor | string | undefined,
  values: Readonly<Record<string, unknown>> = {},
  id?: string,
  options?: Omit<MessageOptions, "message">,
): string {
  if (typeof message === "string") {
    return i18n._(id ?? message, values, {
      ...options,
      message,
    });
  }

  if (message) {
    return i18n._(mergeRuntimeTransValues(message, values));
  }

  if (id) {
    return i18n._(id, values, options);
  }

  return "";
}
