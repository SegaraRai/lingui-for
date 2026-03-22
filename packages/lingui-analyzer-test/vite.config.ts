import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    dts: true,
    entry: {
      index: "src/index.ts",
    },
    attw: {
      profile: "esm-only",
    },
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: ["lingui-for-workspace#build:wasm"],
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
