import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["packages/**/*.test.ts", "examples/**/*.test.ts"],
  },
});
