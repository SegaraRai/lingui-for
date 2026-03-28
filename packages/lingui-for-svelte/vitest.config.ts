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
      "@lingui-for/internal-lingui-analyzer-wasm/loader":
        "@lingui-for/internal-lingui-analyzer-wasm/loader-vite",
    },
  },
  test: {},
});
