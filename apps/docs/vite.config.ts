import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "astro build",
        dependsOn: ["i18n:build"],
        input: [{ auto: true }, "!**/.vite/deps/_metadata.json"],
      },
      check: {
        command: "vp check && vp run check:extra",
        dependsOn: ["i18n:build"],
        cache: false,
      },
      "check:extra": {
        command: "astro check",
        dependsOn: ["i18n:build"],
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
        command: "lingui compile && vp fmt src/i18n/locales",
        cache: true,
        input: ["src/i18n/locales/**/*.po"],
      },
    },
  },
});
