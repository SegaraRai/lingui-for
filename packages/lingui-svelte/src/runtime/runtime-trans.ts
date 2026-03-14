import type { MessageDescriptor } from "@lingui/core";

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
