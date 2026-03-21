import { defineConfig } from "vite-plus";

import markupImport from "unplugin-markup-import/rolldown";

export default defineConfig({
  pack: {
    clean: true,
    dts: true,
    entry: {
      index: "src/index.ts",
      "__internal__/transform": "src/__internal__/transform.ts",
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
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: [
          "lingui-for-workspace#build:wasm",
          "lingui-for-shared#build",
          "unplugin-markup-import#build",
        ],
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
      test: {
        command: "vp test",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
