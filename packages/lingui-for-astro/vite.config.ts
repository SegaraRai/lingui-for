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
      "integration/index": "src/integration/index.ts",
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
    plugins: [markupImport({ frameworks: ["astro"] })],
    inputOptions: {
      moduleTypes: {
        ".wasm": "asset",
      },
    },
    attw: {
      profile: "esm-only",
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "lingui-for-astro",
  },
  resolve: {
    // Vite(st) does not seem to support conditional imports yet?
    // In the future we should use `resolve.conditions` instead.
    alias: {
      "#astro-analyzer-wasm": "./src/compiler-core/analysis/wasm-vite.ts",
    },
  },
});
