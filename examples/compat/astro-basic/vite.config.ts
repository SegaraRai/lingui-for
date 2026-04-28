import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp exec astro build",
        dependsOn: [
          "lingui-for-astro#build",
          "unplugin-lingui-macro#build",
          "i18n:build",
        ],
        cache: false,
      },
      "i18n:extract": {
        command: "vp exec lingui extract --clean --overwrite",
        dependsOn: ["lingui-for-astro#build", "unplugin-lingui-macro#build"],
        cache: false,
      },
      "i18n:build": {
        command: "vp exec lingui compile",
        dependsOn: ["i18n:extract"],
        cache: false,
      },
    },
  },
});
