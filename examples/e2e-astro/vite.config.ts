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
        input: [
          { auto: true },
          "!**/.vite-temp/**",
          "!**/.vite/**",
          "!.astro/**",
          "!dist/**",
        ],
        untrackedEnv: ["PATHEXT"],
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
        command: "vp check",
        dependsOn: ["build", "check:extra"],
        cache: false,
      },
      "check:extra": {
        command: "astro check",
        dependsOn: ["build"],
        cache: false,
      },
      "i18n:extract": {
        command: "lingui extract --clean --overwrite",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
        ],
        cache: true,
        untrackedEnv: ["PATHEXT"],
      },
      "i18n:build": {
        command: "lingui compile && vp fmt src/lib/i18n/locales",
        dependsOn: ["i18n:extract"],
        cache: true,
        input: ["src/lib/i18n/locales/**/*.po"],
        untrackedEnv: ["PATHEXT"],
      },
      test: {
        command: "vp test",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
