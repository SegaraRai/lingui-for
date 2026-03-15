import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig(async () => {
  return {
    plugins: [linguiMacro(), linguiForSvelte(), sveltekit(), tailwindcss()],
  };
});
