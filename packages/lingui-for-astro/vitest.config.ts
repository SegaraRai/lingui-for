import { defineProject } from "vite-plus";

export default defineProject({
  resolve: {
    alias: {
      "@lingui-for/internal-lingui-analyzer-wasm/loader":
        "@lingui-for/internal-lingui-analyzer-wasm/loader-vite",
    },
  },
  test: {},
});
