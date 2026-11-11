import node from "@astrojs/node";
import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import { stillwind } from "@stillwind/integration/astro";
import stripWhitespace from "astro-strip-whitespace";
import type { ViteUserConfig } from "astro";
import { defineConfig } from "astro/config";

import linguiForAstro from "lingui-for-astro/integration";
import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

type PluginOption = NonNullable<ViteUserConfig["plugins"]>[number];

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [
    stillwind(),
    react(),
    svelte(),
    stripWhitespace(),
    linguiForAstro(),
  ],
  vite: {
    plugins: [
      linguiMacro() as unknown as PluginOption,
      linguiForSvelte() as unknown as PluginOption,
    ],
  },
});
