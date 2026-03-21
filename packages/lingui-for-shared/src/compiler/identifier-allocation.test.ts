import { describe, expect, test } from "vite-plus/test";

import { createUniqueNameAllocator } from "./identifier-allocation.ts";

describe("createUniqueNameAllocator", () => {
  test("avoids collisions with existing top-level bindings", () => {
    const allocate = createUniqueNameAllocator(
      `
        import { createLinguiAccessors } from "lingui-for-svelte/runtime";

        const __l4s_ctx = {};
        const __l4s_getI18n = {};
        function __l4s_translate() {}
      `,
      {
        filename: "/virtual/App.svelte.ts",
        parserPlugins: ["typescript", "jsx"],
      },
    );

    expect(allocate("createLinguiAccessors")).toBe("createLinguiAccessors_1");
    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx_1");
    expect(allocate("__l4s_getI18n")).toBe("__l4s_getI18n_1");
    expect(allocate("__l4s_translate")).toBe("__l4s_translate_1");
  });

  test("reserves generated names for subsequent allocations", () => {
    const allocate = createUniqueNameAllocator("", {
      filename: "/virtual/App.svelte.ts",
      parserPlugins: ["typescript", "jsx"],
    });

    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx");
    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx_1");
    expect(allocate("__l4s_ctx")).toBe("__l4s_ctx_2");
  });
});
