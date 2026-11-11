import { defineConfig, lintPresets } from "stillwind/config";

export default defineConfig({
  projects: [
    {
      css: "./src/stillwind.css",
      files: ["src/**/*.{ts,svelte}"],
      lint: {
        extends: [lintPresets.recommended],
      },
    },
  ],
});
