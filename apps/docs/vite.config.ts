import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp exec astro build",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
        ],
        input: [
          { auto: true },
          "!**/.vite-temp/**",
          "!**/.vite/deps/_metadata.json",
          "!.astro/**",
          "!dist/**",
        ],
      },
      dev: {
        command: "vp exec astro dev",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
        ],
        cache: false,
      },
      preview: {
        command: "vp exec astro preview",
        dependsOn: ["build"],
        cache: false,
      },
      check: {
        command: "vp check",
        dependsOn: ["build", "check:extra"],
        cache: false,
      },
      "check:extra": {
        command: "vp exec astro check",
        dependsOn: ["build"],
        cache: false,
      },
      "i18n:extract": {
        command: "vp exec lingui extract --clean --overwrite",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
        ],
        cache: true,
      },
      "i18n:build": {
        command: "vp exec lingui compile && vp fmt src/i18n/locales",
        dependsOn: ["i18n:extract"],
        cache: true,
        input: ["src/i18n/locales/**/*.po"],
      },
    },
  },
});
