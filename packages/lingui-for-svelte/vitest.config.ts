import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineProject } from "vite-plus";

export default defineProject({
  plugins: [
    svelte({
      configFile: false,
    }),
  ],
  test: {},
});
