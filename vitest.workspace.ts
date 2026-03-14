import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "./packages/lingui-svelte/vitest.config.ts",
      "./examples/e2e-svelte/vitest.config.ts",
      "./examples/e2e-svelte/vitest.browser.config.ts",
    ],
  },
});
