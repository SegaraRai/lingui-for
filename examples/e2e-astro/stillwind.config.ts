import { defineConfig, lintPresets } from "stillwind/config";

export default defineConfig({
  projects: [
    {
      css: "./src/styles/stillwind.css",
      files: ["src/**/*.{ts,tsx,svelte,astro}"],
      // @astrojs/astro2tsx 0.1.4 rejects the comment-only interpolations that this page tests
      exclude: ["src/pages/interpolation.astro"],
      lint: {
        extends: [lintPresets.recommended],
      },
    },
  ],
});
