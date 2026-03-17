import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["examples/*", "examples/*/vitest.*.config.ts", "packages/*"],
  },
});
