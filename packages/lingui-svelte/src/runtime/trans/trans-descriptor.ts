import type { I18n, MessageDescriptor, MessageOptions } from "@lingui/core";

export function toRuntimeTransDescriptor(
  message: MessageDescriptor | string,
  id?: string,
): MessageDescriptor {
  if (typeof message !== "string") {
    return message;
  }

  return {
    id: id ?? message,
    message,
  };
}

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
