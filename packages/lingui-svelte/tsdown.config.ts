import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    "extractor/index": "src/extractor/index.ts",
    "macro/index": "src/macro/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "runtime/component-utils": "src/runtime/component-utils.ts", // Required for *.svelte files, as tsdown cannot rewrite imports within .svelte files.
    "unplugin/index": "src/unplugin/index.ts",
    "unplugin/types": "src/unplugin/types.ts",
    "unplugin/esbuild": "src/unplugin/esbuild.ts",
    "unplugin/rollup": "src/unplugin/rollup.ts",
    "unplugin/rspack": "src/unplugin/rspack.ts",
    "unplugin/vite": "src/unplugin/vite.ts",
    "unplugin/webpack": "src/unplugin/webpack.ts",
  },
  inputOptions: {
    external: [/\.svelte$/],
  },
});
