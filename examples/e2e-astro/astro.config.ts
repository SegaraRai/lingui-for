import node from "@astrojs/node";
import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import stripWhitespace from "astro-strip-whitespace";
import { defineConfig } from "astro/config";
import type { PluginOption } from "vite";

import linguiForAstro from "lingui-for-astro/integration";
import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [react(), svelte(), stripWhitespace(), linguiForAstro()],
  vite: {
    plugins: [
      linguiMacro() as unknown as PluginOption,
      linguiForSvelte() as unknown as PluginOption,
      tailwindcss(),
    ],
  },
});
