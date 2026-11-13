import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: [
      "**/.astro",
      "**/.svelte-kit",
      "**/.sveltekit-build",
      "**/.unplugin-markup-import",
      "**/dist",
      "**/generated",
      "crates/lingui-analyzer/benches/fixtures/*",
      "examples/compat/__snapshots__/**",
      "examples/compat/projects/**",
      "examples/config-types/cases/*",
      "examples/e2e-astro/src/pages/framework/interpolation.astro",
      "examples/e2e-astro/src/pages/interpolation.astro",
    ],
  },
  fmt: {
    endOfLine: "lf",
    sortPackageJson: true,
    astro: true,
    svelte: true,
    printWidth: 80,
    ignorePatterns: [
      "**/.astro",
      "**/.svelte-kit",
      "**/.sveltekit-build",
      "**/.unplugin-markup-import",
      "**/dist",
      "**/generated",
      "crates/lingui-analyzer/benches/fixtures/*",
      "examples/compat/__snapshots__/**",
      "examples/e2e-astro/src/pages/framework/interpolation.astro",
      "examples/e2e-astro/src/pages/interpolation.astro",
      "pnpm-lock.yaml",
    ],
  },
  run: {
    tasks: {
      build: {
        command: "",
        dependsOn: [
          "e2e-astro#build",
          "e2e-svelte#build",
          "docs#build",
          "artifacts",
        ],
      },
      "build:docs": {
        command: "",
        dependsOn: ["docs#build"],
      },
      "build:examples": {
        command: "",
        dependsOn: ["e2e-astro#build", "e2e-svelte#build"],
      },
      "build:lib": {
        command: "",
        dependsOn: [
          "lingui-for-svelte#build",
          "lingui-for-astro#build",
          "unplugin-lingui-macro#build",
        ],
      },
      "build:plugin": {
        command: "",
        dependsOn: ["unplugin-markup-import#build"],
      },
      "build:wasm": {
        command: "node ./build-wasm.ts",
        cache: {
          input: [
            { auto: true },
            "!target/**",
            "!shared/lingui-analyzer-wasm/dist/**",
          ],
          env: ["LINGUI_WASM_PREBUILT", "LINGUI_WASM_DEBUG"],
        },
      },
      check: {
        command: "vp run -r check",
        cache: false,
      },
      format: {
        command: "stillwind fmt && vp fmt .",
        cache: false,
      },
      test: {
        command: "vp test",
        dependsOn: ["build"],
        cache: false,
      },
      "test:compat": {
        command: "node ./examples/compat/compat-matrix.ts",
        dependsOn: [
          "lingui-for-svelte#build",
          "lingui-for-astro#build",
          "unplugin-lingui-macro#build",
        ],
        cache: false,
      },
      inspect: {
        command: "vp run inspect --filter conformance",
        cache: false,
      },
      artifacts: {
        command: "node ./generate-artifacts.ts",
        dependsOn: ["build:lib"],
        cache: {
          input: [{ auto: true }],
        },
      },
    },
  },
});
