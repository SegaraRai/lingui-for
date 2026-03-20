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
  run: {
    tasks: {
      build: {
        command: "vp pack",
      },
      check: {
        command: "vp check",
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
