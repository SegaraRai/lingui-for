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
      "pnpm-lock.yaml",
    ],
  },
  run: {
    tasks: {
      build: {
        command:
          "vp run build:lib && vp run --filter ./apps/* --filter ./examples/* build",
      },
      "build:apps": {
        command: "vp run --filter ./apps/* build",
      },
      "build:examples": {
        command: "vp run --filter ./examples/* build",
      },
      "build:lib": {
        command:
          "vp run --filter lingui-for-svelte --filter lingui-for-astro --filter unplugin-lingui-macro build",
        dependsOn: ["build:wasm"],
      },
      "build:plugin": {
        command: "vp run --filter unplugin-lingui-macro build",
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
      inspect: {
        command: "vp run inspect --filter conformance",
        cache: false,
      },
      artifacts: {
        command: "node ./generate-artifacts.ts",
        dependsOn: ["build:lib"],
        cache: true,
        input: [{ auto: true }],
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
