import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite-plus";

import markupImport from "unplugin-markup-import/rolldown";

export default defineConfig({
  pack: {
    clean: true,
    dts: true,
    tsconfig: "tsconfig.lib.json",
    entry: {
      "extractor/index": "src/extractor/index.ts",
      "macro/index": "src/macro/index.ts",
      "runtime/index": "src/runtime/index.ts",
      "unplugin/index": "src/unplugin/index.ts",
      "unplugin/types": "src/unplugin/types.ts",
      "unplugin/bun": "src/unplugin/bun.ts",
      "unplugin/esbuild": "src/unplugin/esbuild.ts",
      "unplugin/rolldown": "src/unplugin/rolldown.ts",
      "unplugin/rollup": "src/unplugin/rollup.ts",
      "unplugin/rspack": "src/unplugin/rspack.ts",
      "unplugin/vite": "src/unplugin/vite.ts",
      "unplugin/webpack": "src/unplugin/webpack.ts",
    },
    plugins: [markupImport()],
    attw: {
      profile: "esm-only",
    },
  },
  plugins: [svelte()],
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "lingui-for-svelte",
  },
});
