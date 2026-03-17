import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "lingui-for-astro",
  },
  resolve: {
    // Vite(st) does not seem to support conditional imports yet?
    // In the future we should use `resolve.conditions` instead.
    alias: {
      "#astro-analyzer-wasm": "./src/compiler-core/analysis/wasm-vite.ts",
    },
  },
});
