import { defineConfig } from "vite-plus";

import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      fileName: "index",
      formats: ["es"],
    },
    minify: false,
    rollupOptions: {
      external: ["@lingui/core"],
      output: {
        chunkFileNames: "[name].js",
        entryFileNames: "[name].js",
      },
    },
    sourcemap: false,
  },
  plugins: [linguiMacro()],
  run: {
    tasks: {
      build: {
        command: "vp build",
        dependsOn: ["unplugin-lingui-macro#build", "i18n:build"],
        cache: false,
      },
      "i18n:extract": {
        command: "lingui extract --clean --overwrite",
        dependsOn: ["unplugin-lingui-macro#build"],
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
