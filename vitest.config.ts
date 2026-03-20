import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["examples/*", "packages/*"],
  },
});
