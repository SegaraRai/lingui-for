import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["dist"],
  },
  pack: {
    clean: true,
    dts: true,
    tsconfig: "tsconfig.lib.json",
    entry: {
      index: "src/index.ts",
      types: "src/types.ts",
      rolldown: "src/rolldown.ts",
      rollup: "src/rollup.ts",
      vite: "src/vite.ts",
    },
    attw: {
      profile: "esm-only",
    },
  },
});
