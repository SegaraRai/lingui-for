import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [svelte()],
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "lingui-for-svelte",
  },
});
