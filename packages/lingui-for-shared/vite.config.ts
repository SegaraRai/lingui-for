import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    dts: true,
    entry: {
      index: "src/index.ts",
      "compiler/index": "src/compiler/index.ts",
      "runtime/index": "src/runtime/index.ts",
      "test-helpers/index": "src/test-helpers/index.ts",
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
