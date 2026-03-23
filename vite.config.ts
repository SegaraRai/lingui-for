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
      "**/vendor",
      "**/dist",
    ],
  },
  fmt: {
    sortTailwindcss: {},
    sortPackageJson: true,
    printWidth: 80,
    ignorePatterns: [
      "**/.astro",
      "**/.svelte-kit",
      "**/.sveltekit-build",
      "**/.unplugin-markup-import",
      "**/dist",
      "**/vendor",
      "pnpm-lock.yaml",
    ],
  },
  test: {
    projects: ["packages/*", "apps/*", "examples/*"],
  },
  run: {
    tasks: {
      build: {
        command: "vp run build:apps && vp run build:examples",
        dependsOn: ["build:lib"],
      },
      "build:apps": {
        command: "vp run build --filter ./apps/*",
        dependsOn: ["build:lib"],
      },
      "build:examples": {
        command: "vp run build --filter ./examples/*",
        dependsOn: ["build:lib"],
      },
      "build:lib": {
        command:
          "vp run build --filter lingui-for-svelte... --filter lingui-for-astro... --filter unplugin-lingui-macro...",
        dependsOn: ["build:shared", "build:plugin", "build:wasm"],
      },
      "build:shared": {
        command: "vp run build --filter lingui-for-shared...",
      },
      "build:plugin": {
        command: "vp run build --filter unplugin-lingui-macro...",
      },
      "build:wasm": {
        command: "node ./build-wasm.ts",
        cache: true,
        env: ["LINGUI_WASM_PREBUILT", "LINGUI_WASM_DEBUG"],
      },
      check: {
        command: "vp run -r check",
        cache: false,
      },
      format: {
        command: "prettier -w **/*.{astro,svelte} && vp fmt .",
        cache: false,
      },
      test: {
        command: "vp test",
        dependsOn: ["build"],
        cache: false,
      },
      release: {
        command: "vp pm publish -r --access public --provenance",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
