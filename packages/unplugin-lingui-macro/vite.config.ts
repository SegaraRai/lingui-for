import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    clean: true,
    dts: true,
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
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        cache: {
          input: [
            { auto: true },
            "!**/_tmp_*",
            "!**/.vite-temp/**",
            "!dist/**",
          ],
        },
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
