import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

import { linguiSvelte } from "lingui-for-svelte/unplugin/vite";

export default defineConfig(async () => {
  return {
    plugins: [linguiSvelte.vite(), sveltekit()],
  };
});
