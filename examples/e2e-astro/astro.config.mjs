import node from "@astrojs/node";
import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import stripWhitespace from "astro-strip-whitespace";
import { defineConfig } from "astro/config";

import linguiForAstro from "lingui-for-astro/unplugin/vite";
import linguiForSvelte from "lingui-for-svelte/unplugin/vite";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [react(), svelte(), stripWhitespace()],
  vite: {
    plugins: [linguiForAstro(), linguiForSvelte(), tailwindcss()],
  },
});
