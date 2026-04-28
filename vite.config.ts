import { defineConfig } from "vite-plus";

export default defineConfig({
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
      "examples/compat/astro-basic/**",
      "examples/compat/sveltekit-basic/**",
      "examples/compat/vite-basic/**",
      "examples/config-types/cases/*",
    ],
  },
  fmt: {
    endOfLine: "lf",
    sortTailwindcss: {},
    sortPackageJson: true,
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
        cache: true,
        input: [
          { auto: true },
          "!target/**",
          "!shared/lingui-analyzer-wasm/dist/**",
        ],
        env: ["LINGUI_WASM_PREBUILT", "LINGUI_WASM_DEBUG"],
        untrackedEnv: ["PATHEXT"],
      },
      check: {
        command: "vp run -r check",
        cache: false,
      },
      format: {
        command: "prettier -w **/*.{astro,svelte,mdx} && vp fmt .",
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
        cache: true,
        input: [{ auto: true }],
        untrackedEnv: ["PATHEXT"],
      },
      release: {
        command:
          "vp exec pnpm publish -r --access public --provenance && vp exec changeset tag",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
