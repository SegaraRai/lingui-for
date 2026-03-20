import { expect, it } from "vite-plus/test";

import { getLinguiContext, setLinguiContext } from "./context.ts";

it("stores and reads the request-scoped Lingui context from Astro.locals", () => {
  const locals: Record<string, unknown> = {};
  const i18n = { _: () => "translated" } as never;

  setLinguiContext(locals, i18n);

  expect(getLinguiContext({ locals }).i18n).toBe(i18n);
});
