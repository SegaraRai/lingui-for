import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    linguiMacro(),
    linguiForSvelte(),
    tailwindcss(),
    // sveltekit interferes with Vitest's test environment, so we disable it in test mode.
    mode === "test" ? null : sveltekit(),
  ],
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    maxWorkers: 1,
    name: "e2e-svelte",
  },
}));
