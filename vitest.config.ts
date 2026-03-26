import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      "@lingui-for/internal-lingui-analyzer-wasm/loader":
        "@lingui-for/internal-lingui-analyzer-wasm/loader-vite",
    },
  },
  test: {
    projects: ["packages/*", "apps/*", "examples/*"],
  },
});
