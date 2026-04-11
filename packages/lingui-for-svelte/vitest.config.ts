import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineProject } from "vite-plus";

export default defineProject({
  plugins: [
    svelte({
      configFile: false,
    }),
  ],
  resolve: {
    alias: {
      "@lingui-for/framework-core/compile/wasm-loader":
        "@lingui-for/framework-core/compile/wasm-loader-vite",
    },
  },
  test: {},
});
