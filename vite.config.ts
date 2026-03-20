import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    sortTailwindcss: {},
    sortPackageJson: true,
    printWidth: 80,
    ignorePatterns: ["pnpm-lock.yaml"],
  },
});
