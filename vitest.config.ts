import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["examples/*", "examples/*/vitest.*.config.ts", "packages/*"],
  },
});
