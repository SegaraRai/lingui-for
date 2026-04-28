import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite-plus";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  plugins: [linguiMacro(), linguiForSvelte(), sveltekit()],
  run: {
    tasks: {
      build: {
        command: "vp build",
        dependsOn: [
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "sveltekit:sync",
          "i18n:build",
        ],
        cache: false,
      },
      "sveltekit:sync": {
        command: "svelte-kit sync",
        cache: false,
      },
      "i18n:extract": {
        command: "lingui extract --clean --overwrite",
        dependsOn: ["lingui-for-svelte#build", "unplugin-lingui-macro#build"],
        cache: false,
      },
      "i18n:build": {
        command: "lingui compile",
        dependsOn: ["i18n:extract"],
        cache: false,
      },
    },
  },
});
