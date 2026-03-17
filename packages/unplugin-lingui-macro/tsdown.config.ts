import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  tsconfig: "tsconfig.lib.json",
  entry: {
    index: "src/index.ts",
    types: "src/types.ts",
    bun: "src/bun.ts",
    esbuild: "src/esbuild.ts",
    rolldown: "src/rolldown.ts",
    rollup: "src/rollup.ts",
    rspack: "src/rspack.ts",
    vite: "src/vite.ts",
    webpack: "src/webpack.ts",
  },
  attw: {
    profile: "esm-only",
  },
});
