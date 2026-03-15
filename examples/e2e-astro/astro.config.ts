import node from "@astrojs/node";
import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import stripWhitespace from "astro-strip-whitespace";
import { defineConfig } from "astro/config";

import linguiForAstro from "lingui-for-astro/integration";
import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiCoreMacroVite from "./lingui-core-macro-vite";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [
    react({
      babel: {
        plugins: ["macros"],
      },
    }),
    svelte(),
    stripWhitespace(),
    linguiForAstro(),
  ],
  vite: {
    plugins: [linguiCoreMacroVite(), linguiForSvelte(), tailwindcss()],
  },
});
