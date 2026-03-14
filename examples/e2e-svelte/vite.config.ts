import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";

export default defineConfig(async () => {
  return {
    plugins: [linguiForSvelte(), sveltekit()],
  };
});
