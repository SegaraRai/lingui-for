import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
    name: "e2e-svelte",
  },
});
