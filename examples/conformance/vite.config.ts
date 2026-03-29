import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      check: {
        command: "vp check",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
        ],
        cache: false,
      },
      test: {
        command: "vp test",
        dependsOn: [
          "lingui-for-astro#build",
          "lingui-for-svelte#build",
          "unplugin-lingui-macro#build",
        ],
        cache: false,
      },
      inspect: {
        command: "node inspect.ts",
        cache: false,
      },
    },
  },
});
