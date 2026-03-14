import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
    maxWorkers: 1,
    name: "e2e-svelte",
  },
});
