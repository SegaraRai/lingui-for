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
        cache: true,
        input: [
          { auto: true },
          "!**/.vite-temp/**",
          "!.svelte-kit/**",
          "!.sveltekit-build/**",
          "!dist/**",
        ],
      },
      dev: {
        command: "vp dev",
        dependsOn: [
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
          "sveltekit:sync",
        ],
        cache: false,
      },
      preview: {
        command: "node .sveltekit-build/index.js",
        dependsOn: ["build"],
        cache: false,
      },
      check: {
        command: "vp check",
        dependsOn: ["build", "check:extra"],
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
        input: [
          { auto: true },
          "!**/.vite-temp/**",
          "!.svelte-kit/**",
          "!.sveltekit-build/**",
          "!dist/**",
        ],
      },
      "i18n:extract": {
        command: "lingui extract --clean --overwrite",
        dependsOn: ["lingui-for-svelte#build", "unplugin-lingui-macro#build"],
        cache: true,
      },
      "i18n:build": {
        command: "lingui compile && vp fmt src/lib/i18n/locales",
        dependsOn: ["i18n:extract"],
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
