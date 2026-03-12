import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  deps: {
    skipNodeModulesBundle: true,
  },
  entry: {
    "extractor/index": "src/build/extractor.ts",
    "macro/index": "src/macro/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "unplugin/index": "src/unplugin/index.ts",
  },
  inputOptions: {
    external: [/\.svelte$/],
  },
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  tsconfig: "./tsconfig.json",
  unbundle: true,
});
