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
      "**/dist",
      "pnpm-lock.yaml",
    ],
  },
  test: {
    projects: ["packages/*", "apps/*", "examples/*"],
  },
  run: {
    tasks: {
      build: {
        command: "vp run --filter ./examples/* --filter ./apps/* build",
        dependsOn: ["build:lib"],
      },
      "build:lib": {
        command:
          "vp run build --filter lingui-for-svelte... --filter lingui-for-astro... --filter unplugin-lingui-macro...",
        dependsOn: ["build:plugin", "build:wasm"],
      },
      "build:plugin": {
        command: "vp run build --filter unplugin-lingui-macro...",
      },
      "build:wasm": {
        cache: true,
        command:
          "wasm-pack build --target web --release --out-dir ../../packages/astro-analyzer-wasm/dist --out-name index",
        cwd: "crates/astro-analyzer",
      },
      "build:wasm-dev": {
        cache: true,
        command:
          "wasm-pack build --target web  --dev --no-opt --out-dir ../../packages/astro-analyzer-wasm/dist --out-name index",
        cwd: "crates/astro-analyzer",
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
