import { defineProject } from "vite-plus";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "e2e-astro",
  },
});
