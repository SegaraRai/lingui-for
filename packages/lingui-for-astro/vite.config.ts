import { wasm } from "rolldown-plugin-wasm";
import { defineConfig } from "vite-plus";

import markupImport from "unplugin-markup-import/rolldown";

export default defineConfig({
  pack: {
    clean: true,
    dts: {
      eager: true,
    },
    entry: {
      index: "src/index.ts",
      extractor: "src/extractor.ts",
      config: "src/config.ts",
      macro: "src/macro.ts",
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
      "internal/compile": "src/internal/compile.ts",
    },
    plugins: [
      markupImport({
        frameworks: ["astro"],
        exclude: ["**/*.test.astro"],
      }),
      wasm(),
    ],
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
          "unplugin-markup-import#build",
        ],
        cache: true,
        input: [
          { auto: true },
          "!**/.vite-temp/**",
          "!**/.unplugin-markup-import/**",
          "!.astro/**",
          "!dist/**",
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
      pretest: {
        command: "node scripts/generate-framework-whitespace-fixtures.ts",
        cache: true,
        input: [{ auto: true }],
      },
      test: {
        command: "vp test",
        dependsOn: ["pretest", "build"],
        cache: false,
      },
    },
  },
});
