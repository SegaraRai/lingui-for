import { defineProject } from "vite-plus";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    name: "e2e-astro",
  },
});
