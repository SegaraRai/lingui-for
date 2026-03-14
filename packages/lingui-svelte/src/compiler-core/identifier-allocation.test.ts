import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { createUniqueNameAllocator } from "./identifier-allocation.ts";

describe("createUniqueNameAllocator", () => {
  it("avoids collisions with existing top-level bindings", () => {
    const allocate = createUniqueNameAllocator(
      dedent`
        import { getLinguiContext } from "lingui-svelte/runtime";

        const __l4s_ctx = {};
        const __l4s_i18n = {};
        function __l4s_translate() {}
      `,
      {
        filename: "/virtual/App.svelte.ts",
        lang: "ts",
      },
    );

    expect(allocate("getLinguiContext")).toBe("getLinguiContext_1");
    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx_1");
    expect(allocate("__l4s_i18n")).toBe("__l4s_i18n_1");
    expect(allocate("__l4s_translate")).toBe("__l4s_translate_1");
  });

  it("reserves generated names for subsequent allocations", () => {
    const allocate = createUniqueNameAllocator("", {
      filename: "/virtual/App.svelte.ts",
      lang: "ts",
    });

    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx");
    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx_1");
    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx_2");
  });
});
