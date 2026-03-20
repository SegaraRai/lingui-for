import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ["**/dist", "**/.astro"],
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
    projects: ["packages/*", "examples/*"],
  },
});
