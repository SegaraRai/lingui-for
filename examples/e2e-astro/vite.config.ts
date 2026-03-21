import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "astro build",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
        ],
        input: [{ auto: true }, "!**/.vite/deps/_metadata.json"],
      },
      dev: {
        command: "astro dev",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
        ],
        cache: false,
      },
      preview: {
        command: "astro preview --port 4542",
        dependsOn: ["build"],
        cache: false,
      },
      check: {
        command: "vp check && vp run check:extra",
        dependsOn: ["build"],
        cache: false,
      },
      "check:extra": {
        command: "astro check",
        dependsOn: ["build"],
        cache: false,
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
