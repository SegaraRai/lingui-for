import { defineProject } from "vite-plus";

export default defineProject({
  resolve: {
    alias: {
      "@lingui-for/framework-core/compile/wasm-loader":
        "@lingui-for/framework-core/compile/wasm-loader-vite",
    },
  },
  test: {},
});
