import type { I18n, MessageDescriptor } from "@lingui/core";
import { expect, test } from "vite-plus/test";

import {
  createFrontmatterI18n,
  getLinguiContext,
  setLinguiContext,
} from "./context.ts";

test("stores and reads the request-scoped Lingui context from Astro.locals", () => {
  const locals: Record<string, unknown> = {};
  const i18n = { _: () => "translated" };

  setLinguiContext(locals, i18n as unknown as I18n);

  expect(getLinguiContext(locals).i18n).toBe(i18n);
});

test("createFrontmatterI18n defers getLinguiContext until the first _ call", () => {
  const locals: Record<string, unknown> = {};
  const i18n = {
    _: (descriptor: MessageDescriptor) => descriptor.id,
  };

  const accessor = createFrontmatterI18n(locals);
  setLinguiContext(locals, i18n as unknown as I18n);

  expect(accessor._({ id: "hello.key" })).toBe("hello.key");
});
