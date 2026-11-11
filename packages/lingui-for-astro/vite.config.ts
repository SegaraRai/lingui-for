import { defineConfig } from "vite-plus";
import type { PackUserConfig } from "vite-plus/pack";

import markupImport from "unplugin-markup-import/rolldown";

// Rolldown plugins are typed against their own rolldown, not the copy bundled in Vite+
type PackPlugin = NonNullable<PackUserConfig["plugins"]>;

export default defineConfig({
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
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
      }) as unknown as PackPlugin,
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
          "@lingui-for/framework-core#build",
          "unplugin-markup-import#build",
        ],
        cache: {
          input: [
            { auto: true },
            "!**/_tmp_*",
            "!**/.vite-temp/**",
            "!**/.unplugin-markup-import/**",
            "!.astro/**",
            "!dist/**",
          ],
        },
      },
      check: {
        command: "vp check",
        dependsOn: ["build", "check:extra"],
        cache: false,
      },
      "check:extra": {
        command: "astro check",
        dependsOn: ["build"],
        cache: false,
      },
      pretest: {
        command: "node scripts/generate-framework-whitespace-fixtures.ts",
        cache: {
          input: [{ auto: true }],
        },
      },
      test: {
        command: "vp test",
        dependsOn: ["pretest", "build"],
        cache: false,
      },
    },
  },
});
