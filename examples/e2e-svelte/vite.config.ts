import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  plugins: [linguiMacro(), linguiForSvelte(), tailwindcss(), sveltekit()],
  run: {
    tasks: {
      build: {
        command: "vp build",
        dependsOn: [
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
          "sveltekit:sync",
        ],
      },
      preview: {
        command: "node .sveltekit-build/index.js",
        dependsOn: ["build"],
        cache: false,
      },
      check: {
        command: "vp check && vp run check:extra",
        dependsOn: ["build"],
        cache: false,
      },
      "check:extra": {
        command: "svelte-check",
        dependsOn: ["build"],
        cache: false,
      },
      "sveltekit:sync": {
        command: "svelte-kit sync",
        cache: true,
      },
      "i18n:build": {
        command: "vp run i18n:extract && vp run i18n:compile",
        cache: true,
      },
      "i18n:extract": {
        command: "lingui extract --clean --overwrite",
        cache: true,
      },
      "i18n:compile": {
        command: "lingui compile && vp fmt src/lib/i18n/locales",
        cache: true,
        input: ["src/lib/i18n/locales/**/*.po"],
      },
      test: {
        command: "vp test",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
