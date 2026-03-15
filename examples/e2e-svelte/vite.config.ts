import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiCoreMacroVite from "./lingui-core-macro-vite";

export default defineConfig(async () => {
  return {
    plugins: [
      linguiCoreMacroVite(),
      linguiForSvelte(),
      sveltekit(),
      tailwindcss(),
    ],
  };
});
