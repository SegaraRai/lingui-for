import { expect, test } from "vite-plus/test";

import { getLinguiContext, setLinguiContext } from "./context.ts";

test("stores and reads the request-scoped Lingui context from Astro.locals", () => {
  const locals: Record<string, unknown> = {};
  const i18n = { _: () => "translated" } as never;

  setLinguiContext(locals, i18n);

  expect(getLinguiContext(locals).i18n).toBe(i18n);
});
