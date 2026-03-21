import { defineProject } from "vite-plus";

export default defineProject({
  test: {},
  resolve: {
    // Vite(st) does not seem to support conditional imports yet?
    // In the future we should use `resolve.conditions` instead.
    alias: {
      "#astro-analyzer-wasm": "./src/compiler-core/analysis/wasm-vite.ts",
    },
  },
});
