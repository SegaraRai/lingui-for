import type { I18n, MessageDescriptor } from "@lingui/core";
import { expect, test } from "vite-plus/test";

import {
  createLinguiAccessors,
  getLinguiContext,
  setLinguiContext,
} from "./context.ts";

test("stores and reads the request-scoped Lingui context from Astro.locals", () => {
  const locals: Record<string, unknown> = {};
  const i18n = { _: () => "translated" };

  setLinguiContext(locals, i18n as unknown as I18n);

  expect(getLinguiContext(locals).i18n).toBe(i18n);
});

test("createLinguiAccessors defers getLinguiContext until the first _ call", () => {
  const locals: Record<string, unknown> = {};
  const i18n = {
    _: (descriptor: MessageDescriptor) => descriptor.id,
  };

  const accessor = createLinguiAccessors(locals);
  setLinguiContext(locals, i18n as unknown as I18n);

  expect(accessor._({ id: "hello.key" })).toBe("hello.key");
});

test("createLinguiAccessors primes and memoizes the request context", () => {
  const locals: Record<string, unknown> = {};
  const first = {
    _: (descriptor: MessageDescriptor) => `first:${descriptor.id}`,
  };
  const second = {
    _: (descriptor: MessageDescriptor) => `second:${descriptor.id}`,
  };

  setLinguiContext(locals, first as unknown as I18n);
  const accessor = createLinguiAccessors(locals);
  accessor.prime();
  setLinguiContext(locals, second as unknown as I18n);

  expect(accessor._({ id: "hello.key" })).toBe("first:hello.key");
});
