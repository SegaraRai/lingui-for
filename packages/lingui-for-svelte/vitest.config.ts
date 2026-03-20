import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineProject } from "vite-plus";

export default defineProject({
  plugins: [
    svelte({
      configFile: false,
    }),
  ],
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "lingui-for-svelte",
  },
});
