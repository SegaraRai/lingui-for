import { defineProject } from "vite-plus";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    maxWorkers: 1,
    name: "e2e-svelte",
  },
});
